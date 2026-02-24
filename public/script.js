document.addEventListener('DOMContentLoaded', function() {
    const checkBtn = document.getElementById('checkBtn');
    const status = document.getElementById('status');
    const log = document.getElementById('log');
    const results = document.getElementById('results');
    const totalContainers = document.getElementById('totalContainers');
    const containersWithUpdates = document.getElementById('containersWithUpdates');
    const updatesList = document.getElementById('updatesList');
    
    // 添加日志记录
    function addLog(message, type = 'info') {
        const logLine = document.createElement('div');
        logLine.className = `log-line log-${type}`;
        logLine.textContent = `${new Date().toLocaleTimeString()}: ${message}`;
        log.appendChild(logLine);
        log.scrollTop = log.scrollHeight;
    }
    
    // 清空日志
    function clearLog() {
        log.innerHTML = '';
    }
    
    // 清空结果
    function clearResults() {
        updatesList.innerHTML = '';
        results.style.display = 'none';
    }
    
    // 检查按钮点击事件
    checkBtn.addEventListener('click', async function() {
        // 禁用按钮，防止重复点击
        checkBtn.disabled = true;
        status.textContent = '检查中...';
        
        // 清空之前的日志和结果
        clearLog();
        clearResults();
        
        addLog('开始检查容器镜像更新...', 'info');
        
        try {
            // 调用后端API
            const response = await fetch('./api/check-updates');
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || '检查失败');
            }
            
            addLog(`共发现 ${data.totalContainers} 个容器`, 'success');
            
            // 更新状态和统计信息
            status.textContent = '检查完成';
            totalContainers.textContent = data.totalContainers;
            containersWithUpdates.textContent = data.containersWithUpdates;
            
            // 显示结果
            results.style.display = 'block';
            
            if (data.containersWithUpdates > 0) {
                addLog(`${data.containersWithUpdates} 个容器需要更新`, 'info');
                
                // 显示需要更新的容器
                data.containers.forEach(container => {
                    if (container.hasUpdate) {
                        const containerCard = document.createElement('div');
                        containerCard.className = 'container-card';
                        
                        // 构建更新信息内容
                        let updateInfoContent = `<p>最新镜像更新于 ${container.daysSinceUpdate} 天前</p>`;
                        if (!container.hasRemoteDigest) {
                            updateInfoContent += `<p class="warning">⚠️ 无法获取远程镜像Digest，更新状态可能不准确</p>`;
                        }
                        
                        containerCard.innerHTML = `
                            <h5>${container.containerName}</h5>
                            <div class="container-info">
                                <p><span>容器ID:</span> ${container.containerId.substring(0, 12)}...</p>
                                <p><span>镜像:</span> ${container.image}</p>
                                <p><span>状态:</span> ${container.isRunning ? '运行中' : '已停止'}</p>
                                <p><span>Digest状态:</span> ${container.hasRemoteDigest ? '已获取' : '无法获取'}</p>
                            </div>
                            <div class="update-info">
                                ${updateInfoContent}
                            </div>
                        `;
                        
                        updatesList.appendChild(containerCard);
                    }
                });
            } else {
                addLog('所有容器镜像均为最新版本', 'success');
                updatesList.innerHTML = '<p>所有容器镜像均为最新版本，无需更新。</p>';
            }
            
        } catch (error) {
            addLog(`检查失败: ${error.message}`, 'error');
            status.textContent = '检查失败';
        } finally {
            // 启用按钮
            checkBtn.disabled = false;
        }
    });
});
