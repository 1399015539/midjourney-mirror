// Simplified mirror service for testing without real puppeteer
class SimpleMirrorService {
    constructor() {
        this.mockContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Midjourney Mirror - Test Mode</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .test-container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            text-align: center;
        }
        .success {
            color: #28a745;
            font-size: 24px;
            margin-bottom: 20px;
        }
        .info {
            color: #6c757d;
            margin-bottom: 15px;
        }
        .account-info {
            background: #e9ecef;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
        }
        .status {
            display: inline-block;
            padding: 5px 10px;
            background: #28a745;
            color: white;
            border-radius: 3px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="test-container">
        <div class="success">✅ 镜像功能正常工作！</div>
        
        <div class="info">
            <strong>测试模式说明：</strong><br>
            当前运行在测试模式下，模拟了镜像页面的基本功能。
        </div>
        
        <div class="account-info">
            <h3>当前使用账号</h3>
            <div id="account-name">Loading...</div>
            <div class="status">ACTIVE</div>
        </div>
        
        <div class="info">
            <strong>功能验证：</strong><br>
            ✅ 用户认证 - 正常<br>
            ✅ 账号选择 - 正常<br>
            ✅ 会话管理 - 正常<br>
            ✅ API代理 - 准备就绪<br>
            ⚠️ Puppeteer抓取 - 测试模式
        </div>
        
        <p><strong>生产环境部署提示：</strong></p>
        <ul style="text-align: left; max-width: 400px; margin: 0 auto;">
            <li>确保服务器有足够内存（建议4GB+）</li>
            <li>安装Chrome/Chromium浏览器</li>
            <li>配置无头模式运行</li>
            <li>设置合适的Cookie和代理</li>
        </ul>
        
        <script>
            // 获取当前账号信息
            const selectedAccount = JSON.parse(localStorage.getItem('selected_account') || '{}');
            if (selectedAccount.name) {
                document.getElementById('account-name').textContent = selectedAccount.name + ' (' + selectedAccount.email + ')';
            }
            
            // 模拟一些API调用测试
            setTimeout(() => {
                console.log('Mirror test mode loaded successfully');
                console.log('Selected account:', selectedAccount);
            }, 1000);
        </script>
    </div>
</body>
</html>`;
    }

    async createTestSession(accountId) {
        // 模拟会话创建
        return {
            sessionId: 'test_' + Date.now(),
            accountId: accountId,
            status: 'active'
        };
    }

    async getTestContent(accountId) {
        // 返回测试内容
        return {
            content: this.mockContent,
            status: 200,
            headers: { 'content-type': 'text/html' },
            url: 'https://www.midjourney.com',
            timestamp: Date.now(),
            testMode: true
        };
    }
}

module.exports = SimpleMirrorService;