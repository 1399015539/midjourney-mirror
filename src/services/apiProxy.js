const { createProxyMiddleware } = require('http-proxy-middleware');
const logger = require('../utils/logger');

class APIProxy {
    constructor() {
        this.accountSessions = new Map();
        this.proxyInstances = new Map();
    }

    // 创建特定账号的代理中间件
    createAccountProxy(accountId, cookies, userAgent) {
        const proxyMiddleware = createProxyMiddleware({
            target: 'https://www.midjourney.com',
            changeOrigin: true,
            secure: true,
            followRedirects: true,
            timeout: 30000,
            
            onProxyReq: (proxyReq, req, res) => {
                // 设置必要的请求头
                proxyReq.setHeader('User-Agent', userAgent || this.getRandomUserAgent());
                proxyReq.setHeader('Accept', 'application/json, text/plain, */*');
                proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
                proxyReq.setHeader('Accept-Encoding', 'gzip, deflate, br');
                proxyReq.setHeader('Connection', 'keep-alive');
                proxyReq.setHeader('Sec-Fetch-Dest', 'empty');
                proxyReq.setHeader('Sec-Fetch-Mode', 'cors');
                proxyReq.setHeader('Sec-Fetch-Site', 'same-origin');
                proxyReq.setHeader('sec-ch-ua', '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"');
                proxyReq.setHeader('sec-ch-ua-mobile', '?0');
                proxyReq.setHeader('sec-ch-ua-platform', '"macOS"');

                // 设置Cookie
                if (cookies) {
                    proxyReq.setHeader('Cookie', cookies);
                }

                // 设置Referer
                proxyReq.setHeader('Referer', 'https://www.midjourney.com/');
                proxyReq.setHeader('Origin', 'https://www.midjourney.com');

                // 如果有请求体，确保正确设置Content-Type
                if (req.body && Object.keys(req.body).length > 0) {
                    const bodyData = JSON.stringify(req.body);
                    proxyReq.setHeader('Content-Type', 'application/json');
                    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
                    proxyReq.write(bodyData);
                }

                logger.info(`Proxying ${req.method} request to: ${proxyReq.path} for account: ${accountId}`);
            },

            onProxyRes: (proxyRes, req, res) => {
                // 处理CORS头
                proxyRes.headers['Access-Control-Allow-Origin'] = req.headers.origin || '*';
                proxyRes.headers['Access-Control-Allow-Credentials'] = 'true';
                proxyRes.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
                proxyRes.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Referer, User-Agent';

                // 移除一些可能导致问题的头
                delete proxyRes.headers['content-security-policy'];
                delete proxyRes.headers['x-frame-options'];
                delete proxyRes.headers['x-content-type-options'];

                logger.info(`Proxy response: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
            },

            onError: (err, req, res) => {
                logger.error('Proxy error:', err);
                res.status(500).json({
                    error: 'Proxy request failed',
                    message: err.message
                });
            }
        });

        this.proxyInstances.set(accountId, proxyMiddleware);
        return proxyMiddleware;
    }

    // 处理WebSocket代理
    createWebSocketProxy(accountId, cookies) {
        return createProxyMiddleware({
            target: 'wss://www.midjourney.com',
            ws: true,
            changeOrigin: true,
            
            onProxyReqWs: (proxyReq, req, socket) => {
                // 设置WebSocket请求头
                if (cookies) {
                    proxyReq.setHeader('Cookie', cookies);
                }
                proxyReq.setHeader('Origin', 'https://www.midjourney.com');
                proxyReq.setHeader('User-Agent', this.getRandomUserAgent());
                
                logger.info(`WebSocket proxy established for account: ${accountId}`);
            },

            onError: (err, req, res) => {
                logger.error('WebSocket proxy error:', err);
            }
        });
    }

    // 获取随机User-Agent
    getRandomUserAgent() {
        const userAgents = [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        return userAgents[Math.floor(Math.random() * userAgents.length)];
    }

    // 代理静态资源请求
    createStaticProxy() {
        return createProxyMiddleware({
            target: 'https://www.midjourney.com',
            changeOrigin: true,
            secure: true,
            
            pathRewrite: (path, req) => {
                // 移除本地路径前缀，直接使用原始路径
                return path.replace(/^\/proxy\/static/, '');
            },

            onProxyReq: (proxyReq, req, res) => {
                proxyReq.setHeader('User-Agent', this.getRandomUserAgent());
                proxyReq.setHeader('Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8');
                proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
                proxyReq.setHeader('Accept-Encoding', 'gzip, deflate, br');
                proxyReq.setHeader('Cache-Control', 'no-cache');
                proxyReq.setHeader('Pragma', 'no-cache');
                
                // 设置Referer确保看起来像正常请求
                proxyReq.setHeader('Referer', 'https://www.midjourney.com/');
            },

            onProxyRes: (proxyRes, req, res) => {
                // 处理静态资源的缓存头
                if (proxyRes.statusCode === 200) {
                    proxyRes.headers['Cache-Control'] = 'public, max-age=3600';
                }
                
                // 允许跨域访问
                proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            }
        });
    }

    // 创建CDN资源代理
    createCDNProxy() {
        return createProxyMiddleware({
            target: 'https://cdn.midjourney.com',
            changeOrigin: true,
            secure: true,
            
            pathRewrite: (path, req) => {
                return path.replace(/^\/proxy\/cdn/, '');
            },

            onProxyReq: (proxyReq, req, res) => {
                proxyReq.setHeader('User-Agent', this.getRandomUserAgent());
                proxyReq.setHeader('Accept', 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8');
                proxyReq.setHeader('Accept-Language', 'en-US,en;q=0.9');
                proxyReq.setHeader('Referer', 'https://www.midjourney.com/');
            },

            onProxyRes: (proxyRes, req, res) => {
                // 设置图片缓存
                if (proxyRes.statusCode === 200) {
                    proxyRes.headers['Cache-Control'] = 'public, max-age=86400'; // 24小时
                }
                proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            }
        });
    }

    // 获取账号代理实例
    getAccountProxy(accountId) {
        return this.proxyInstances.get(accountId);
    }

    // 清理账号代理
    cleanupAccountProxy(accountId) {
        if (this.proxyInstances.has(accountId)) {
            this.proxyInstances.delete(accountId);
            logger.info(`Cleaned up proxy for account: ${accountId}`);
        }
    }

    // 清理所有代理实例
    cleanup() {
        this.proxyInstances.clear();
        this.accountSessions.clear();
        logger.info('All proxy instances cleaned up');
    }
}

module.exports = APIProxy;