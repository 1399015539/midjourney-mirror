const cheerio = require('cheerio');
const axios = require('axios');
const logger = require('../utils/logger');
const FlareSolverrService = require('./flareSolverrService');

class FlareMirrorService {
    constructor() {
        const flareSolverrUrl = process.env.FLARESOLVERR_URL || 'http://flaresolverr:8191/v1';
        logger.info(`Initializing FlareMirrorService with FlareSolverr URL: ${flareSolverrUrl}`);
        this.flareSolverr = new FlareSolverrService(flareSolverrUrl);
        this.sessions = new Map(); // accountId -> session info with cookies
        this.httpClients = new Map(); // accountId -> axios instance with cookies
        
        // 定期清理过期会话
        setInterval(() => this.cleanup(), 1000 * 60 * 30); // 每30分钟清理一次
    }

    // 创建会话
    async createSession(accountId, cookieString) {
        try {
            logger.info(`Creating/reusing FlareSolverr mirror session for account: ${accountId}`);
            
            // 检查是否已存在有效会话
            const existingSession = this.getSession(accountId);
            if (existingSession && Date.now() - existingSession.created < 1000 * 60 * 60) { // 1小时内的会话视为有效
                logger.info(`Reusing existing session for account: ${accountId}`);
                return existingSession;
            }
            
            logger.info(`Creating new FlareSolverr session for account: ${accountId}`);
            
            // 检查FlareSolverr是否可用
            const isHealthy = await this.flareSolverr.healthCheck();
            if (!isHealthy) {
                throw new Error('FlareSolverr service is not available. Please check if the service is running properly.');
            }

            // 如果存在旧会话，先清理
            if (existingSession) {
                await this.cleanup(accountId);
            }

            // 创建新的FlareSolverr会话
            await this.flareSolverr.createSession(accountId);
            
            // 存储会话信息
            const session = {
                id: accountId,
                cookies: cookieString || '',
                created: Date.now(),
                lastActivity: Date.now()
            };
            this.sessions.set(accountId, session);

            // 创建基础HTTP客户端
            if (cookieString) {
                this.createBasicHttpClient(accountId, cookieString);
            }

            logger.info(`FlareSolverr mirror session created successfully for account: ${accountId}`);
            return session;
        } catch (error) {
            logger.error(`Failed to create FlareSolverr mirror session for account ${accountId}:`, error.message);
            throw new Error(`Failed to create mirror session: ${error.message}`);
        }
    }

    // 创建基础HTTP客户端
    createBasicHttpClient(accountId, cookieString) {
        try {
            const httpClient = axios.create({
                timeout: 30000,
                maxRedirects: 5,
                validateStatus: status => status >= 200 && status < 400,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cookie': cookieString,
                    'Referer': 'https://www.midjourney.com/',
                    'Origin': 'https://www.midjourney.com',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                }
            });

            this.httpClients.set(accountId, httpClient);
            logger.info(`Created basic HTTP client for account: ${accountId}`);
        } catch (error) {
            logger.error(`Failed to create HTTP client for account ${accountId}:`, error.message);
            throw new Error(`Failed to create HTTP client: ${error.message}`);
        }
    }

    // 获取会话
    getSession(accountId) {
        const session = this.sessions.get(accountId);
        if (session) {
            session.lastActivity = Date.now();
            return session;
        }
        return null;
    }

    // 抓取页面内容
    async fetchPage(accountId) {
        const session = this.getSession(accountId);
        if (!session) {
            throw new Error(`No valid session found for account: ${accountId}`);
        }

        try {
            const result = await this.flareSolverr.request(accountId, 'https://www.midjourney.com');
            
            // 检查响应状态
            if (result.status >= 400) {
                throw new Error(`Failed to fetch page: HTTP ${result.status}`);
            }

            return {
                content: result.response,
                status: result.status,
                url: result.url,
                challenge: result.hasOwnProperty('challengeRequired')
            };
        } catch (error) {
            logger.error(`Failed to fetch page for account ${accountId}:`, error.message);
            throw new Error(`Failed to fetch page: ${error.message}`);
        }
    }

    // 代理静态资源
    async proxyStaticResource(accountId, resourcePath) {
        const session = this.getSession(accountId);
        if (!session) {
            throw new Error(`No valid session found for account: ${accountId}`);
        }

        // 处理相对路径和绝对路径
        let fullUrl;
        if (resourcePath.startsWith('http')) {
            fullUrl = resourcePath;
        } else if (resourcePath.startsWith('//')) {
            fullUrl = `https:${resourcePath}`;
        } else {
            fullUrl = `https://www.midjourney.com${resourcePath.startsWith('/') ? resourcePath : '/' + resourcePath}`;
        }

        try {
            // 获取资源
            const result = await this.flareSolverr.request(accountId, fullUrl);
            
            // 检查响应状态
            if (result.status >= 400) {
                throw new Error(`Failed to fetch resource: HTTP ${result.status}`);
            }

            // 从原始响应头中获取内容类型
            let contentType = result.headers && (
                result.headers['content-type'] ||
                result.headers['Content-Type']
            );

            // 如果没有内容类型或者内容类型不正确，根据URL推断
            if (!contentType || contentType.includes('application/json')) {
                contentType = this.inferContentTypeFromUrl(fullUrl);
            }

            // 构建响应头
            const headers = {
                'content-type': contentType,
                'cache-control': 'public, max-age=3600',
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'GET, OPTIONS',
                'access-control-allow-headers': 'Content-Type, Authorization, X-Mirror-Account-ID, X-Mirror-Session-ID'
            };

            // 如果是字体文件，添加额外的CORS头
            if (fullUrl.match(/\.(woff2?|ttf|eot|otf)(\?|$)/i)) {
                headers['access-control-allow-origin'] = '*';
                headers['access-control-allow-methods'] = 'GET, OPTIONS';
                headers['access-control-allow-headers'] = '*';
            }

            // 处理响应数据
            let responseData = result.response;

            // 如果是CSS文件，处理其中的URL
            if (contentType.includes('text/css')) {
                responseData = this.processCssUrls(responseData, fullUrl);
            }

            // 如果是JavaScript文件，确保正确的MIME类型
            if (fullUrl.match(/\.js(\?|$)/i)) {
                headers['content-type'] = 'application/javascript; charset=utf-8';
            }

            return {
                data: responseData,
                headers: headers,
                status: result.status || 200
            };
        } catch (error) {
            logger.error(`Failed to proxy static resource ${fullUrl}:`, error.message);
            throw error;
        }
    }

    // 从URL推断内容类型
    inferContentTypeFromUrl(url) {
        const extension = url.split('.').pop().split('?')[0].toLowerCase();
        const mimeTypes = {
            css: 'text/css; charset=utf-8',
            js: 'application/javascript; charset=utf-8',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            woff: 'application/font-woff',
            woff2: 'font/woff2',
            ttf: 'font/ttf',
            eot: 'application/vnd.ms-fontobject',
            otf: 'font/otf',
            ico: 'image/x-icon'
        };

        // 特殊处理Google Fonts和其他常见CDN
        if (url.includes('fonts.googleapis.com/css')) {
            return 'text/css; charset=utf-8';
        }
        if (url.includes('googletagmanager.com')) {
            return 'application/javascript; charset=utf-8';
        }
        if (url.includes('cloudflare.com') && url.includes('.js')) {
            return 'application/javascript; charset=utf-8';
        }
        
        return mimeTypes[extension] || 'application/octet-stream';
    }

    // 处理CSS中的URL
    processCssUrls(css, baseUrl) {
        if (typeof css !== 'string') {
            return css;
        }

        // 替换CSS中的相对URL为绝对URL
        return css.replace(/url\(['"]?([^'")]+)['"]?\)/g, (match, url) => {
            if (url.startsWith('data:') || url.startsWith('http')) {
                return match;
            }
            const absoluteUrl = new URL(url, baseUrl).href;
            return `url("${absoluteUrl}")`;
        });
    }

    // 清理会话
    async cleanup(accountId = null) {
        try {
            if (accountId) {
                if (this.sessions.has(accountId)) {
                    await this.flareSolverr.destroySession(accountId);
                    this.sessions.delete(accountId);
                    this.httpClients.delete(accountId);
                    logger.info(`Cleaned up session for account: ${accountId}`);
                }
            } else {
                const now = Date.now();
                const maxAge = 1000 * 60 * 60; // 1小时

                for (const [accId, session] of this.sessions.entries()) {
                    if (now - session.lastActivity > maxAge) {
                        await this.cleanup(accId);
                    }
                }
            }
        } catch (error) {
            logger.error('Error during session cleanup:', error.message);
        }
    }
}

module.exports = FlareMirrorService;