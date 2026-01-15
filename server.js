const express = require('express');
const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3000;
const docker = new Docker();

// 存储所有的SSE客户端连接
const clients = [];

// 自定义日志函数，同时输出到控制台和SSE客户端
function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  
  // 发送日志给所有SSE客户端
  clients.forEach(client => {
    client.write(`data: ${JSON.stringify({ message, timestamp })}\n\n`);
  });
}

// 设置静态文件目录
app.use(express.static(path.join(__dirname, 'public')));

// API: SSE端点，用于实时推送日志
app.get('/api/logs', (req, res) => {
  // 设置SSE响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // 添加客户端到连接列表
  clients.push(res);
  
  // 发送初始消息
  res.write(`data: ${JSON.stringify({ message: '已连接到日志服务', timestamp: new Date().toISOString() })}\n\n`);
  
  // 客户端关闭连接时，从列表中移除
  req.on('close', () => {
    const index = clients.indexOf(res);
    if (index > -1) {
      clients.splice(index, 1);
    }
  });
});

// API: 获取所有容器并检查镜像更新
app.get('/api/check-updates', async (req, res) => {
  try {
    // 获取所有容器（无论是否运行）
    log('开始检查容器镜像更新...');
    const containers = await docker.listContainers({ all: true });
    log('发现 ' + containers.length + ' 个容器');
    
    const results = [];
    
    for (const containerInfo of containers) {
      const containerName = containerInfo.Names[0].substring(1);
      log('检查容器: ' + containerName);
      
      const container = docker.getContainer(containerInfo.Id);
      const containerDetails = await container.inspect();
      const imageName = containerDetails.Config.Image;
      
      log('  容器 ' + containerName + ' 使用镜像: ' + imageName);
      
      // 检查镜像更新
      const updateInfo = await checkImageUpdate(imageName);
      
      if (updateInfo.hasUpdate) {
        log('  容器 ' + containerName + ' 需要更新，最新镜像更新于 ' + updateInfo.daysSinceUpdate + ' 天前');
      } else {
        log('  容器 ' + containerName + ' 镜像已是最新版本');
      }
      
      results.push({
        containerId: containerInfo.Id,
        containerName: containerName,
        image: imageName,
        isRunning: containerInfo.State === 'running',
        hasUpdate: updateInfo.hasUpdate,
        // 修复：当daysSinceUpdate为0时，应该返回0而不是null
        daysSinceUpdate: updateInfo.daysSinceUpdate === null ? null : updateInfo.daysSinceUpdate,
        latestDigest: updateInfo.latestDigest || null,
        localDigest: updateInfo.localDigest || null,
        remoteDigest: updateInfo.remoteDigest || null,
        hasRemoteDigest: updateInfo.hasRemoteDigest || false
      });
    }
    
    const containersWithUpdates = results.filter(c => c.hasUpdate).length;
    log('检查完成，共 ' + containersWithUpdates + ' 个容器需要更新');
    
    res.json({
      success: true,
      containers: results,
      totalContainers: containers.length,
      containersWithUpdates: containersWithUpdates
    });
  } catch (error) {
    log('检查失败: ' + error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 检查单个镜像是否有更新
async function checkImageUpdate(imageName) {
  try {
    // 获取本地镜像信息
    log('    获取本地镜像信息: ' + imageName);
    const localImage = await docker.getImage(imageName);
    const localInfo = await localImage.inspect();
    const localDigest = localInfo.RepoDigests ? localInfo.RepoDigests[0] : null;
    const localCreated = new Date(localInfo.Created);
    
    log('    本地镜像创建时间: ' + localCreated.toISOString());
    log('    本地镜像Digest: ' + (localDigest || '无'));
    
    // 解析镜像名称和标签（处理私有仓库地址，如registry.example.com:5000/repo:tag）
    log('    原始镜像名称: ' + imageName);
    let repo, tag = 'latest';
    
    // 处理带有端口号的私有仓库地址（如registry.example.com:5000/repo:tag）
    const parts = imageName.split('/');
    if (parts.length > 1) {
      // 检查是否包含端口号
      const firstPart = parts[0];
      if (firstPart.includes(':') && !firstPart.includes('.')) {
        // 不包含点号，不是域名，直接使用简单分割
        [repo, tag] = imageName.split(':');
      } else if (firstPart.includes('.') && firstPart.includes(':')) {
        // 包含域名和端口号，特殊处理
        // 找到最后一个冒号作为标签分隔符
        const lastColonIndex = imageName.lastIndexOf(':');
        repo = imageName.substring(0, lastColonIndex);
        tag = imageName.substring(lastColonIndex + 1);
      } else {
        // 正常分割
        [repo, tag] = imageName.split(':');
      }
    } else {
      // 官方镜像，如nginx:latest
      [repo, tag] = imageName.split(':');
    }
    
    // 确保tag有值
    if (!tag || tag.includes('/')) {
      // 如果没有标签或标签中包含斜杠（说明分割错误），使用默认标签
      tag = 'latest';
      repo = imageName;
    }
    
    // 处理官方库镜像（如nginx -> library/nginx）
    if (!repo.includes('/')) {
      repo = `library/${repo}`;
    }
    
    log('    解析后 - 仓库: ' + repo + ', 标签: ' + tag);
    
    // 获取远程镜像信息（简化实现，实际生产环境需要更复杂的逻辑）
    // 这里我们使用Docker Hub API获取最新镜像信息
    log('    查询Docker Hub镜像: ' + repo + ':' + tag);
    
    let remoteInfo, latestImageDate, daysSinceUpdate, remoteDigest;
    let hasRemoteDigest = false;
    
    try {
      const response = await fetch(`https://registry.hub.docker.com/v2/repositories/${repo}/tags/${tag}`);
      if (!response.ok) {
        log('    无法获取远程镜像信息，状态码: ' + response.status);
        return { hasUpdate: false, hasRemoteDigest: false };
      }
      
      remoteInfo = await response.json();
      
      // 检查远程镜像信息中的digest
      if (remoteInfo.digest) {
        hasRemoteDigest = true;
        remoteDigest = `${repo}@${remoteInfo.digest}`;
      } else {
        // 尝试从images数组中获取digest（Docker Hub API有时会将digest放在images数组中）
        if (remoteInfo.images && remoteInfo.images.length > 0) {
          for (const image of remoteInfo.images) {
            if (image.digest) {
              hasRemoteDigest = true;
              remoteDigest = `${repo}@${image.digest}`;
              break;
            }
          }
        }
        
        if (!hasRemoteDigest) {
          // 无法获取digest，使用null
          remoteDigest = null;
          log('    警告：无法从远程镜像信息中获取Digest');
        }
      }
      
      // 处理镜像更新时间
      let lastUpdated = remoteInfo.last_updated;
      if (!lastUpdated && remoteInfo.images && remoteInfo.images.length > 0) {
        // 尝试从images数组中获取最新的更新时间
        const sortedImages = remoteInfo.images.sort((a, b) => {
          return new Date(b.last_updated) - new Date(a.last_updated);
        });
        lastUpdated = sortedImages[0].last_updated;
      }
      
      latestImageDate = new Date(lastUpdated);
      const now = new Date();
      daysSinceUpdate = Math.floor((now - latestImageDate) / (1000 * 60 * 60 * 24));
      
      log('    远程镜像更新时间: ' + latestImageDate.toISOString());
      log('    远程镜像Digest: ' + (remoteDigest || '无法获取'));
    } catch (error) {
      log('    获取远程镜像信息时出错: ' + error.message);
      return { hasUpdate: false, hasRemoteDigest: false };
    }
    
    // 改进的比较逻辑：
    // 1. 如果本地和远程都有digest，直接比较
    // 2. 如果只有本地有digest，远程没有，无法确定，标记为无需更新
    // 3. 如果本地没有digest，比较镜像创建时间
    let hasUpdate = false;
    let reason = '';
    
    if (localDigest && hasRemoteDigest) {
      // 本地和远程都有digest，直接比较
      hasUpdate = localDigest !== remoteDigest;
      if (hasUpdate) {
        reason = 'digest不匹配';
        log('    Digest比较结果: 不匹配 (本地: ' + localDigest + ', 远程: ' + remoteDigest + ')');
      } else {
        reason = 'digest匹配';
        log('    Digest比较结果: 匹配');
      }
    } else if (localDigest && !hasRemoteDigest) {
      // 本地有digest，远程没有，无法确定，假设无需更新
      hasUpdate = false;
      reason = '本地有Digest但远程无法获取，无法确定更新状态，假设无需更新';
      log('    Digest比较结果: ' + reason);
    } else {
      // 本地没有digest，比较创建时间，允许1小时的误差
      const timeDiff = latestImageDate - localCreated;
      const timeDiffHours = Math.floor(timeDiff / (1000 * 60 * 60));
      log('    时间差: ' + timeDiff + ' 毫秒 (' + timeDiffHours + ' 小时)');
      
      hasUpdate = timeDiff > 3600000; // 1小时 = 3600000毫秒
      if (hasUpdate) {
        reason = '远程镜像更新时间晚于本地镜像1小时以上';
      } else {
        reason = '远程镜像更新时间在本地镜像1小时以内';
      }
      log('    时间比较结果: ' + reason);
    }
    
    log('    最终结果: ' + (hasUpdate ? '需要更新' : '已是最新') + ' (' + reason + ')');
    
    return {
      hasUpdate,
      // 确保daysSinceUpdate是数字类型，避免返回null
      daysSinceUpdate: typeof daysSinceUpdate === 'number' ? daysSinceUpdate : 0,
      latestDigest: hasRemoteDigest ? remoteInfo.digest : null,
      localDigest: localDigest,
      remoteDigest: remoteDigest,
      hasRemoteDigest: hasRemoteDigest
    };
  } catch (error) {
    log('    检查镜像更新时出错: ' + error.message);
    return { 
      hasUpdate: false, 
      daysSinceUpdate: 0,
      hasRemoteDigest: false 
    };
  }
}

// 启动服务器
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
