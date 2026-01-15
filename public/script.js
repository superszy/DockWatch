document.addEventListener('DOMContentLoaded', function() {
    const checkBtn = document.getElementById('checkBtn');
    const status = document.getElementById('status');
    const log = document.getElementById('log');
    const results = document.getElementById('results');
    const totalContainers = document.getElementById('totalContainers');
    const containersWithUpdates = document.getElementById('containersWithUpdates');
    const updatesList = document.getElementById('updatesList');
    const copySuccess = document.getElementById('copySuccess');
    
    // SSE连接对象
    let eventSource;
    
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
    
    // 显示复制成功提示
    function showCopySuccess() {
        // 显示提示
        copySuccess.classList.add('show');
        
        // 2秒后隐藏提示
        setTimeout(() => {
            copySuccess.classList.remove('show');
        }, 2000);
    }
    
    // 初始化SSE连接
    function initSSE() {
        // 关闭现有的连接（如果有）
        if (eventSource) {
            eventSource.close();
        }
        
        // 创建新的SSE连接
        eventSource = new EventSource('/api/logs');
        
        // 监听消息事件
        eventSource.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                addLog(data.message);
            } catch (error) {
                console.error('解析日志消息失败:', error);
            }
        };
        
        // 监听错误事件
        eventSource.onerror = function(error) {
            console.error('SSE连接错误:', error);
            addLog('日志连接中断，正在尝试重新连接...', 'error');
            // 尝试重新连接
            setTimeout(initSSE, 3000);
        };
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
            const response = await fetch('/api/check-updates');
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || '检查失败');
            }
            
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
                        
                        // 添加复制功能的辅助函数
                        function addCopyFunctionality(element) {
                            element.addEventListener('click', function() {
                                const fullText = this.getAttribute('data-full-text');
                                if (fullText && fullText !== '无法获取') {
                                    // 尝试使用 Clipboard API
                                    if (navigator.clipboard && navigator.clipboard.writeText) {
                                        navigator.clipboard.writeText(fullText).then(() => {
                                            // 显示复制成功提示
                                            showCopySuccess();
                                        }).catch(err => {
                                            console.error('复制失败:', err);
                                            // 降级方案：使用传统的复制方法
                                            fallbackCopyTextToClipboard(fullText);
                                        });
                                    } else {
                                        // 直接使用降级方案
                                        fallbackCopyTextToClipboard(fullText);
                                    }
                                }
                            });
                        }
                        
                        // 降级复制方法，兼容不支持 Clipboard API 的浏览器
                        function fallbackCopyTextToClipboard(text) {
                            // 创建临时文本区域
                            const textArea = document.createElement('textarea');
                            textArea.value = text;
                            
                            // 设置样式以确保文本区域不可见
                            textArea.style.position = 'fixed';
                            textArea.style.left = '-999999px';
                            textArea.style.top = '-999999px';
                            textArea.style.opacity = '0';
                            
                            // 添加到文档
                            document.body.appendChild(textArea);
                            
                            // 选择并复制文本
                            textArea.focus();
                            textArea.select();
                            
                            try {
                                // 执行复制命令
                                const successful = document.execCommand('copy');
                                if (successful) {
                                    showCopySuccess();
                                } else {
                                    console.error('复制失败：execCommand 返回 false');
                                }
                            } catch (err) {
                                console.error('复制失败:', err);
                            } finally {
                                // 清理临时元素
                                document.body.removeChild(textArea);
                            }
                        }
                        
                        // 创建容器卡片内容
                        const containerCardContent = `
                            <h5>${container.containerName}</h5>
                            <div class="container-info">
                                <p class="copyable" title="${container.containerId}" data-full-text="${container.containerId}"><span>容器ID:</span> ${container.containerId.substring(0, 12)}...</p>
                                <p><span>镜像:</span> ${container.image}</p>
                                <p><span>状态:</span> ${container.isRunning ? '运行中' : '已停止'}</p>
                        `;
                        
                        // 构建Digest信息
                        let digestContent = '';
                        if (container.localDigest) {
                            digestContent += `<p class="copyable" title="${container.localDigest}" data-full-text="${container.localDigest}"><span>本地Digest:</span> ${container.localDigest.substring(0, 20)}...</p>`;
                        } else {
                            digestContent += `<p><span>本地Digest:</span> 无法获取</p>`;
                        }
                        if (container.remoteDigest) {
                            digestContent += `<p class="copyable" title="${container.remoteDigest}" data-full-text="${container.remoteDigest}"><span>最新Digest:</span> ${container.remoteDigest.substring(0, 20)}...</p>`;
                        } else {
                            digestContent += `<p><span>最新Digest:</span> 无法获取</p>`;
                        }
                        
                        // 完成容器卡片HTML
                        containerCard.innerHTML = containerCardContent + digestContent + `
                            </div>
                            <div class="update-info">
                                ${updateInfoContent}
                            </div>
                        `;
                        
                        // 为所有可复制元素添加点击复制功能
                        const copyableElements = containerCard.querySelectorAll('.copyable');
                        copyableElements.forEach(addCopyFunctionality);
                        
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
    
    // 初始化SSE连接
    initSSE();
});
