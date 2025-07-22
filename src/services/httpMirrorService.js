const axios = require('axios');
const cheerio = require('cheerio');
const tough = require('tough-cookie');
const { CookieJar } = tough;
const logger = require('../utils/logger');
const UserAgent = require('user-agents');

class HttpMirrorService {
    constructor() {
        this.sessions = new Map(); // accountId -> session info
        this.userAgent = new UserAgent();
    }

    // 创建HTTP会话
    async createSession(accountId, cookieString) {
        try {
            // 创建Cookie Jar
            const cookieJar = new CookieJar();
            
            // 解析并设置Cookie
            if (cookieString) {
                const cookies = this.parseCookies(cookieString);
                for (const cookie of cookies) {
                    try {
                        await cookieJar.setCookie(cookie, 'https://www.midjourney.com');
                        logger.debug(`Set cookie: ${cookie.split('=')[0]}`);
                    } catch (error) {
                        logger.warn(`Failed to set cookie: ${error.message}`);
                    }
                }
            }

            // 创建axios实例
            const httpClient = axios.create({
                timeout: 30000,
                maxRedirects: 5,
                headers: {
                    'User-Agent': this.userAgent.toString(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1',
                    'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"'
                },
                withCredentials: true,
                validateStatus: function (status) {
                    return status < 500; // 允许4xx错误继续处理
                }
            });

            // 添加请求拦截器自动处理Cookie
            httpClient.interceptors.request.use(async (config) => {
                const cookieHeader = await cookieJar.getCookieString(config.url || config.baseURL || 'https://www.midjourney.com');
                if (cookieHeader) {
                    config.headers.Cookie = cookieHeader;
                }
                return config;
            });

            // 添加响应拦截器自动保存Cookie
            httpClient.interceptors.response.use(async (response) => {
                const setCookieHeaders = response.headers['set-cookie'];
                if (setCookieHeaders) {
                    for (const cookieString of setCookieHeaders) {
                        try {
                            await cookieJar.setCookie(cookieString, response.config.url || 'https://www.midjourney.com');
                        } catch (error) {
                            logger.warn(`Failed to save response cookie: ${error.message}`);
                        }
                    }
                }
                return response;
            });

            const session = {
                accountId,
                cookieJar,
                httpClient,
                userAgent: this.userAgent.toString(),
                createdAt: new Date(),
                lastActivity: new Date()
            };

            this.sessions.set(accountId, session);
            logger.info(`HTTP session created for account: ${accountId}`);
            
            return session;
        } catch (error) {
            logger.error(`Failed to create HTTP session for account ${accountId}:`, error);
            throw error;
        }
    }

    // 获取会话
    getSession(accountId) {
        const session = this.sessions.get(accountId);
        if (session) {
            session.lastActivity = new Date();
        }
        return session;
    }

    // 抓取页面内容
    async fetchPage(accountId, url = 'https://www.midjourney.com') {
        const session = this.getSession(accountId);
        if (!session) {
            throw new Error(`No session found for account: ${accountId}`);
        }

        try {
            logger.info(`Fetching page: ${url} for account: ${accountId}`);
            
            const response = await session.httpClient.get(url);
            
            // 处理Cloudflare挑战
            if (this.isCloudflareChallenge(response)) {
                logger.info('Detected Cloudflare challenge, attempting to handle...');
                return await this.handleCloudflareChallenge(session, url, response);
            }

            // 处理重定向
            if (response.status >= 300 && response.status < 400) {
                const redirectUrl = response.headers.location;
                if (redirectUrl) {
                    logger.info(`Following redirect to: ${redirectUrl}`);
                    return await this.fetchPage(accountId, redirectUrl);
                }
            }

            const html = response.data;
            const $ = cheerio.load(html);
            
            // 重写URL
            const processedHtml = this.rewriteUrls(html, $);
            
            return {
                content: processedHtml,
                status: response.status,
                headers: response.headers,
                url: response.config.url,
                timestamp: Date.now()
            };

        } catch (error) {
            logger.error(`Failed to fetch page for account ${accountId}:`, error);
            throw error;
        }
    }

    // 检测Cloudflare挑战
    isCloudflareChallenge(response) {
        const html = response.data;
        return (
            response.status === 503 ||
            response.status === 403 ||
            html.includes('cloudflare') ||
            html.includes('cf-challenge') ||
            html.includes('Just a moment') ||
            html.includes('DDoS protection')
        );
    }

    // 处理Cloudflare挑战
    async handleCloudflareChallenge(session, url, response) {
        logger.info('Handling Cloudflare challenge...');
        
        // 等待一段时间模拟人类行为
        await this.sleep(5000);
        
        // 尝试重新请求
        try {
            const retryResponse = await session.httpClient.get(url);
            
            if (this.isCloudflareChallenge(retryResponse)) {
                // 如果还是挑战页面，返回一个友好的错误页面
                return {
                    content: this.generateChallengeErrorPage(),
                    status: 503,
                    headers: retryResponse.headers,
                    url: url,
                    timestamp: Date.now(),
                    challenge: true
                };
            }
            
            const html = retryResponse.data;
            const $ = cheerio.load(html);
            return {
                content: this.rewriteUrls(html, $, session.accountId),
                status: retryResponse.status,
                headers: retryResponse.headers,
                url: url,
                timestamp: Date.now()
            };
            
        } catch (error) {
            logger.error('Failed to handle Cloudflare challenge:', error);
            throw error;
        }
    }

    // 生成挑战错误页面
    generateChallengeErrorPage() {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Cloudflare Challenge</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
        .challenge { background: #fff3cd; padding: 20px; border-radius: 10px; }
    </style>
</head>
<body>
    <div class="challenge">
        <h2>🔒 Cloudflare Protection Detected</h2>
        <p>The target website is protected by Cloudflare. Please wait a moment and try again.</p>
        <button onclick="window.location.reload()">Retry</button>
    </div>
</body>
</html>`;
    }

    // 重写URL以便代理
    rewriteUrls(html, $) {
        // 重写样式表链接
        $('link[rel="stylesheet"]').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href && href.startsWith('/')) {
                $(elem).attr('href', `/api/mirror/static${href}`);
            } else if (href && href.includes('midjourney.com')) {
                $(elem).attr('href', href.replace(/https?:\/\/(www\.)?midjourney\.com/, '/api/mirror/static'));
            }
        });

        // 重写脚本链接
        $('script[src]').each((i, elem) => {
            const src = $(elem).attr('src');
            if (src && src.startsWith('/')) {
                $(elem).attr('src', `/api/mirror/static${src}`);
            } else if (src && src.includes('midjourney.com')) {
                $(elem).attr('src', src.replace(/https?:\/\/(www\.)?midjourney\.com/, '/api/mirror/static'));
            }
        });

        // 重写图片链接
        $('img[src]').each((i, elem) => {
            const src = $(elem).attr('src');
            if (src && src.startsWith('/')) {
                $(elem).attr('src', `/api/mirror/static${src}`);
            } else if (src && src.includes('midjourney.com')) {
                $(elem).attr('src', src.replace(/https?:\/\/(www\.)?midjourney\.com/, '/api/mirror/static'));
            }
        });

        // 重写链接
        $('a[href]').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href && href.startsWith('/') && !href.startsWith('/api/')) {
                $(elem).attr('href', `/api/mirror/static${href}`);
            } else if (href && href.includes('midjourney.com')) {
                $(elem).attr('href', href.replace(/https?:\/\/(www\.)?midjourney\.com/, '/api/mirror/static'));
            }
        });

        // 注入代理脚本 - 获取当前会话
        const session = this.getSession(accountId);
        const proxyScript = `
<script>
(function() {
    // 重写fetch
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        if (typeof url === 'string') {
            if (url.startsWith('/api/') || url.includes('midjourney.com/api/')) {
                url = url.replace(/https?:\\/\\/(www\\.)?midjourney\\.com\\/api\\//g, '/api/mirror/mj-api/');
                if (url.startsWith('/api/') && !url.startsWith('/api/mirror/')) {
                    url = '/api/mirror/mj-api' + url;
                }
            }
            options.headers = options.headers || {};
            options.headers['X-Mirror-Account-ID'] = '${session?.accountId || accountId}';
        }
        return originalFetch(url, options);
    };
    
    // 重写XMLHttpRequest
    const originalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
        const xhr = new originalXHR();
        const originalOpen = xhr.open;
        xhr.open = function(method, url, ...args) {
            if (typeof url === 'string') {
                if (url.startsWith('/api/') || url.includes('midjourney.com/api/')) {
                    url = url.replace(/https?:\\/\\/(www\\.)?midjourney\\.com\\/api\\//g, '/api/mirror/mj-api/');
                    if (url.startsWith('/api/') && !url.startsWith('/api/mirror/')) {
                        url = '/api/mirror/mj-api' + url;
                    }
                }
            }
            originalOpen.call(this, method, url, ...args);
            xhr.setRequestHeader('X-Mirror-Account-ID', '${session?.accountId || accountId}');
        };
        return xhr;
    };
    
    console.log('Mirror proxy initialized for account: ${session?.accountId || accountId}');
})();
</script>`;

        // 在head结束前注入脚本
        const headCloseIndex = html.indexOf('</head>');
        if (headCloseIndex !== -1) {
            return html.slice(0, headCloseIndex) + proxyScript + html.slice(headCloseIndex);
        }
        
        return html + proxyScript;
    }

    // 代理静态资源
    async proxyStaticResource(accountId, resourcePath) {
        const session = this.getSession(accountId);
        if (!session) {
            throw new Error(`No session found for account: ${accountId}`);
        }

        const fullUrl = resourcePath.startsWith('http') 
            ? resourcePath 
            : `https://www.midjourney.com${resourcePath}`;

        try {
            const response = await session.httpClient.get(fullUrl, {
                responseType: 'arraybuffer',
                headers: {
                    'Referer': 'https://www.midjourney.com/',
                    'Accept': '*/*'
                }
            });

            return {
                data: response.data,
                headers: response.headers,
                status: response.status
            };
        } catch (error) {
            logger.error(`Failed to proxy static resource ${resourcePath}:`, error);
            throw error;
        }
    }

    // 代理API请求
    async proxyApiRequest(accountId, apiPath, method = 'GET', data = null, headers = {}) {
        const session = this.getSession(accountId);
        if (!session) {
            throw new Error(`No session found for account: ${accountId}`);
        }

        const fullUrl = `https://www.midjourney.com/api${apiPath}`;

        try {
            const config = {
                method: method.toLowerCase(),
                url: fullUrl,
                headers: {
                    'Referer': 'https://www.midjourney.com/',
                    'Accept': 'application/json',
                    ...headers
                }
            };

            if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
                config.data = data;
                config.headers['Content-Type'] = 'application/json';
            }

            const response = await session.httpClient(config);

            return {
                data: response.data,
                headers: response.headers,
                status: response.status
            };
        } catch (error) {
            logger.error(`Failed to proxy API request ${apiPath}:`, error);
            throw error;
        }
    }

    // 解析Cookie字符串
    parseCookies(cookieString) {
        if (!cookieString) return [];
        
        return cookieString.split(';').map(cookie => {
            const trimmed = cookie.trim();
            if (!trimmed) return null;
            
            const equalIndex = trimmed.indexOf('=');
            if (equalIndex === -1) return null;
            
            const name = trimmed.substring(0, equalIndex).trim();
            const value = trimmed.substring(equalIndex + 1).trim();
            
            if (!name) return null;
            
            return `${name}=${value}`;
        }).filter(cookie => cookie !== null);
    }

    // 清理会话
    cleanup(accountId) {
        if (this.sessions.has(accountId)) {
            this.sessions.delete(accountId);
            logger.info(`Cleaned up HTTP session for account: ${accountId}`);
        }
    }

    // 工具函数：延时
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = HttpMirrorService;