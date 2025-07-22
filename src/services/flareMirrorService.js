const cheerio = require('cheerio');
const axios = require('axios');
const logger = require('../utils/logger');
const FlareSolverrService = require('./flareSolverrService');

class FlareMirrorService {
    constructor() {
        this.flareSolverr = new FlareSolverrService(process.env.FLARESOLVERR_URL || 'http://localhost:8191');
        this.sessions = new Map(); // accountId -> session info with cookies
        this.httpClients = new Map(); // accountId -> axios instance with cookies
        
        // 定期清理过期会话
        setInterval(() => {
            this.cleanup();
        }, 1000 * 60 * 10); // 每10分钟清理一次
    }

    // 创建会话
    async createSession(accountId, cookieString) {
        try {
            logger.info(`Creating/reusing FlareSolverr mirror session for account: ${accountId}`);
            
            // 检查是否已存在有效会话
            const existingSession = this.getSession(accountId);
            if (existingSession) {
                logger.info(`Reusing existing session for account: ${accountId}`);
                
                // 验证现有会话是否仍然有效
                try {
                    const testResult = await this.flareSolverr.request(existingSession.sessionId, 'https://www.midjourney.com', 'GET');
                    if (testResult && testResult.status && testResult.status < 400) {
                        logger.info(`Existing session is valid, reusing for account: ${accountId}`);
                        existingSession.lastActivity = new Date();
                        return existingSession;
                    }
                } catch (error) {
                    logger.warn(`Existing session invalid, will create new one for account ${accountId}:`, error.message);
                    // 清理无效会话
                    this.cleanup(accountId);
                }
            }
            
            logger.info(`Creating new FlareSolverr session for account: ${accountId}`);
            logger.info(`FlareSolverr URL: ${this.flareSolverr.flareSolverrUrl}`);
            
            // 检查FlareSolverr是否可用
            const isHealthy = await this.flareSolverr.healthCheck();
            if (!isHealthy) {
                throw new Error('FlareSolverr is not running. Please start FlareSolverr service first.');
            }

            // 创建新的FlareSolverr会话
            const session = await this.flareSolverr.createSession(accountId, cookieString);
            
            // 延迟获取初始页面内容，只在实际需要时才获取
            // 这样可以避免会话创建时的超时问题
            logger.info(`FlareSolverr session created, will fetch initial content on demand`);
            
            this.sessions.set(accountId, {
                ...session,
                cookies: cookieString,
                validCookies: [], // 初始为空，在首次使用时获取
                createdAt: new Date(),
                lastActivity: new Date(),
                needsInitialFetch: true // 标记需要获取初始内容
            });

            // 创建基础HTTP客户端（使用用户提供的cookies）
            this.createBasicHttpClient(accountId, cookieString);

            logger.info(`FlareSolverr mirror session created successfully for account: ${accountId}`);
            return this.sessions.get(accountId);
        } catch (error) {
            logger.error(`Failed to create FlareSolverr mirror session for account ${accountId}:`, error);
            throw error;
        }
    }

    // 创建基础HTTP客户端（使用用户提供的cookies）
    createBasicHttpClient(accountId, cookieString) {
        if (!cookieString) return;
        
        const httpClient = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cookie': cookieString,
                'Referer': 'https://www.midjourney.com/',
                'Origin': 'https://www.midjourney.com'
            }
        });

        this.httpClients.set(accountId, httpClient);
        logger.info(`Created basic HTTP client for account: ${accountId}`);
    }

    // 从FlareSolverr响应中提取cookies
    extractCookiesFromFlareSolverr(result) {
        const cookies = [];
        
        logger.info('FlareSolverr response details:', {
            status: result.status,
            hasHeaders: !!result.headers,
            hasCookies: !!result.cookies,
            cookiesLength: result.cookies ? result.cookies.length : 0
        });
        
        if (result.cookies && Array.isArray(result.cookies)) {
            result.cookies.forEach(cookie => {
                if (cookie.name && cookie.value) {
                    cookies.push(`${cookie.name}=${cookie.value}`);
                    logger.debug(`Extracted cookie: ${cookie.name}=${cookie.value.substring(0, 20)}...`);
                }
            });
        }
        
        // 如果FlareSolverr没有返回cookies，尝试从headers中解析
        if (cookies.length === 0 && result.headers && result.headers['set-cookie']) {
            const setCookies = Array.isArray(result.headers['set-cookie']) 
                ? result.headers['set-cookie'] 
                : [result.headers['set-cookie']];
            
            setCookies.forEach(cookieHeader => {
                const cookieParts = cookieHeader.split(';')[0]; // 只取cookie的名值对部分
                if (cookieParts) {
                    cookies.push(cookieParts);
                    logger.debug(`Extracted cookie from header: ${cookieParts.substring(0, 30)}...`);
                }
            });
        }
        
        logger.info(`Extracted ${cookies.length} cookies from FlareSolverr response`);
        return cookies;
    }

    // 创建带cookies的HTTP客户端
    createHttpClient(accountId, cookies) {
        const cookieString = cookies.join('; ');
        
        logger.info(`Creating HTTP client for account ${accountId} with ${cookies.length} cookies`);
        logger.debug(`Cookie string sample: ${cookieString.substring(0, 200)}...`);
        
        const httpClient = axios.create({
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Cookie': cookieString,
                'Referer': 'https://www.midjourney.com/',
                'Origin': 'https://www.midjourney.com',
                // 添加更多反检测头部
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"macOS"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin'
            },
            // 添加重定向处理
            maxRedirects: 0, // 禁用自动重定向，手动处理
            validateStatus: function (status) {
                return status >= 200 && status < 400; // 接受200-399状态码
            }
        });

        // 添加请求拦截器进行调试
        httpClient.interceptors.request.use(
            (config) => {
                logger.debug(`HTTP Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                logger.error('HTTP Request Error:', error);
                return Promise.reject(error);
            }
        );

        // 添加响应拦截器处理重定向和调试
        httpClient.interceptors.response.use(
            (response) => {
                logger.debug(`HTTP Response: ${response.status} ${response.statusText} for ${response.config.url}`);
                return response;
            },
            async (error) => {
                if (error.response) {
                    const status = error.response.status;
                    const url = error.config.url;
                    
                    logger.warn(`HTTP Response Error: ${status} ${error.response.statusText} for ${url}`);
                    
                    // 处理302重定向 - 可能是Cloudflare挑战
                    if (status === 302 || status === 301) {
                        const location = error.response.headers.location;
                        logger.warn(`Redirect detected for ${url}, location: ${location}`);
                        
                        // 如果是Cloudflare挑战页面，需要重新验证session
                        if (location && (location.includes('challenges.cloudflare.com') || location.includes('cf-challenge'))) {
                            logger.warn(`Cloudflare challenge detected, session may need refresh`);
                            // 抛出特殊错误标识需要刷新
                            const cfError = new Error('Cloudflare challenge detected');
                            cfError.isCloudflareChallenge = true;
                            cfError.originalError = error;
                            return Promise.reject(cfError);
                        }
                    }
                    
                    // 处理403 Forbidden - cookies可能失效
                    if (status === 403) {
                        logger.warn(`403 Forbidden for ${url}, cookies may be invalid`);
                        const authError = new Error('Authentication failed - cookies may be invalid');
                        authError.isAuthError = true;
                        authError.originalError = error;
                        return Promise.reject(authError);
                    }
                } else {
                    logger.error('HTTP Request Failed:', error.message);
                }
                return Promise.reject(error);
            }
        );

        this.httpClients.set(accountId, httpClient);
        logger.info(`Created HTTP client for account: ${accountId}`);
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
    async fetchPage(accountId, url = 'https://www.midjourney.com/explore') {
        const session = this.getSession(accountId);
        if (!session) {
            throw new Error(`No session found for account: ${accountId}`);
        }

        try {
            logger.info(`Fetching page: ${url} for account: ${accountId}`);
            
            // 如果会话需要初始化且请求的是explore页面，进行初始化
            if (session.needsInitialFetch && url === 'https://www.midjourney.com/explore') {
                logger.info(`Performing initial fetch for session: ${accountId}`);
                
                // 使用FlareSolverr获取初始页面来获取有效的cookies
                const initialResult = await this.flareSolverr.request(session.sessionId, url, 'GET');
                
                // 从响应中提取cookies
                const validCookies = this.extractCookiesFromFlareSolverr(initialResult);
                
                // 更新会话信息
                session.validCookies = validCookies;
                session.initialContent = initialResult;
                session.needsInitialFetch = false;
                session.lastActivity = new Date();
                
                // 更新HTTP客户端使用新获取的有效cookies
                this.createHttpClient(accountId, validCookies);
                
                logger.info(`Initial fetch completed for account: ${accountId}`);
                
                const $ = cheerio.load(initialResult.content);
                const processedHtml = this.rewriteUrls(initialResult.content, $, accountId);
                
                return {
                    content: processedHtml,
                    status: initialResult.status || 200,
                    headers: initialResult.headers || {},
                    url: initialResult.url || url,
                    cookies: initialResult.cookies || [],
                    userAgent: initialResult.userAgent,
                    timestamp: initialResult.timestamp,
                    method: 'flaresolverr'
                };
            }
            
            // 如果已经有初始内容且请求的是explore页面，直接使用缓存
            if (session.initialContent && url === 'https://www.midjourney.com/explore') {
                const result = session.initialContent;
                logger.info(`Using cached initial content for ${url}`);
                
                const $ = cheerio.load(result.content);
                const processedHtml = this.rewriteUrls(result.content, $, accountId);
                
                return {
                    content: processedHtml,
                    status: result.status || 200,
                    headers: result.headers || {},
                    url: result.url || url,
                    cookies: result.cookies || [],
                    userAgent: result.userAgent,
                    timestamp: result.timestamp,
                    method: 'flaresolverr'
                };
            }

            // 对于其他页面，使用FlareSolverr
            const result = await this.flareSolverr.request(session.sessionId, url, 'GET');
            
            if (result.content) {
                const $ = cheerio.load(result.content);
                const processedHtml = this.rewriteUrls(result.content, $, accountId);
                
                return {
                    content: processedHtml,
                    status: result.status || 200,
                    headers: result.headers || {},
                    url: result.url || url,
                    cookies: result.cookies || [],
                    userAgent: result.userAgent,
                    timestamp: result.timestamp,
                    method: 'flaresolverr'
                };
            } else {
                throw new Error('No content received from FlareSolverr');
            }

        } catch (error) {
            logger.error(`Failed to fetch page for account ${accountId}:`, error);
            
            // 如果是FlareSolverr连接错误，返回友好的错误页面
            if (error.message.includes('FlareSolverr') || error.code === 'ECONNREFUSED') {
                return {
                    content: this.generateFlareSolverrErrorPage(),
                    status: 503,
                    headers: {},
                    url: url,
                    timestamp: Date.now(),
                    error: true,
                    method: 'flaresolverr'
                };
            }
            
            throw error;
        }
    }

    // 代理静态资源 - 使用HTTP请求，如果失败则回退到FlareSolverr
    async proxyStaticResource(accountId, resourcePath) {
        const session = this.getSession(accountId);
        if (!session) {
            throw new Error(`No session found for account: ${accountId}`);
        }

        // 处理相对路径和绝对路径
        let fullUrl;
        if (resourcePath.startsWith('http')) {
            fullUrl = resourcePath;
        } else if (resourcePath.startsWith('//')) {
            fullUrl = `https:${resourcePath}`;
        } else {
            // 相对路径，补充域名
            fullUrl = `https://www.midjourney.com${resourcePath.startsWith('/') ? resourcePath : '/' + resourcePath}`;
        }

        // 首先尝试HTTP客户端
        const httpClient = this.httpClients.get(accountId);
        if (httpClient) {
            try {
                logger.info(`Proxying static resource via HTTP: ${fullUrl}`);
                
                // 设置正确的Accept头
                const acceptHeader = this.getAcceptHeaderForResource(fullUrl);
                
                const response = await httpClient.get(fullUrl, {
                    headers: {
                        'Accept': acceptHeader
                    },
                    responseType: 'arraybuffer', // 支持二进制数据
                    validateStatus: function (status) {
                        return status >= 200 && status < 400; // 允许重定向
                    },
                    timeout: 15000 // 减少超时时间避免高CPU占用
                });

                // 智能确定内容类型
                let contentType = response.headers['content-type'];
                
                // 如果服务器没有提供正确的content-type，根据URL推断
                if (!contentType || contentType.includes('text/html') || contentType.includes('application/json')) {
                    contentType = this.inferContentType(fullUrl);
                    logger.debug(`Inferred content-type: ${contentType} for ${fullUrl}`);
                }

                return {
                    data: response.data,
                    headers: {
                        'content-type': contentType,
                        'cache-control': 'public, max-age=3600',
                        'access-control-allow-origin': '*',
                        'access-control-allow-headers': 'X-Mirror-Account-ID, X-Mirror-Method'
                    },
                    status: response.status
                };
            } catch (httpError) {
                logger.warn(`HTTP client failed for ${resourcePath}, trying FlareSolverr fallback:`, httpError.message);
                
                // 如果是403错误，说明cookies可能过期，尝试刷新
                if (httpError.response && httpError.response.status === 403) {
                    logger.warn(`Resource blocked by Cloudflare, refreshing session cookies: ${fullUrl}`);
                    
                    try {
                        // 使用FlareSolverr重新获取该页面以刷新cookies
                        const refreshResult = await this.flareSolverr.request(session.sessionId, 'https://www.midjourney.com/explore', 'GET');
                        if (refreshResult && refreshResult.status < 400) {
                            // 提取新的cookies并更新HTTP客户端
                            const newCookies = this.extractCookiesFromFlareSolverr(refreshResult);
                            if (newCookies.length > 0) {
                                session.validCookies = newCookies;
                                this.createHttpClient(accountId, newCookies);
                                logger.info(`Refreshed cookies for account: ${accountId}`);
                            }
                        }
                    } catch (refreshError) {
                        logger.error(`Failed to refresh cookies for account ${accountId}:`, refreshError.message);
                    }
                }
                
                // 回退到FlareSolverr
                return await this.proxyResourceViaFlareSolverr(accountId, fullUrl);
            }
        } else {
            logger.warn(`No HTTP client found for account ${accountId}, using FlareSolverr`);
            return await this.proxyResourceViaFlareSolverr(accountId, fullUrl);
        }
    }

    // 通过FlareSolverr代理资源（回退方案）
    async proxyResourceViaFlareSolverr(accountId, fullUrl) {
        const session = this.getSession(accountId);
        if (!session) {
            throw new Error(`No session found for account: ${accountId}`);
        }

        try {
            logger.info(`Proxying static resource via FlareSolverr: ${fullUrl}`);
            
            const result = await this.flareSolverr.request(session.sessionId, fullUrl, 'GET');
            
            if (!result || result.status >= 400) {
                throw new Error(`FlareSolverr returned error status: ${result ? result.status : 'no result'}`);
            }

            // 智能确定内容类型
            let contentType = result.headers && result.headers['content-type'];
            if (!contentType || contentType.includes('text/html') || contentType.includes('application/json')) {
                contentType = this.inferContentType(fullUrl);
                logger.debug(`Inferred content-type: ${contentType} for ${fullUrl}`);
            }

            return {
                data: result.content,
                headers: {
                    'content-type': contentType,
                    'cache-control': 'public, max-age=3600',
                    'access-control-allow-origin': '*',
                    'access-control-allow-headers': 'X-Mirror-Account-ID, X-Mirror-Method'
                },
                status: result.status || 200
            };
        } catch (error) {
            logger.error(`Failed to proxy static resource ${fullUrl} via FlareSolverr:`, error.message);
            throw error;
        }
    }

    // 根据资源类型返回正确的Accept头
    getAcceptHeaderForResource(url) {
        if (url.match(/\.css(\?|$)/i)) {
            return 'text/css,*/*;q=0.1';
        } else if (url.match(/\.js(\?|$)/i)) {
            return 'application/javascript,*/*;q=0.1';
        } else if (url.match(/\.(png|jpg|jpeg|gif|webp)(\?|$)/i)) {
            return 'image/*,*/*;q=0.8';
        } else if (url.match(/\.(woff|woff2|ttf|eot)(\?|$)/i)) {
            return 'font/*,*/*;q=0.1';
        } else {
            return '*/*';
        }
    }

    // 推断内容类型
    inferContentType(url) {
        // 移除查询参数进行匹配
        const cleanUrl = url.split('?')[0];
        
        if (cleanUrl.match(/\.css$/i)) {
            return 'text/css; charset=utf-8';
        } else if (cleanUrl.match(/\.js$/i)) {
            return 'application/javascript; charset=utf-8';
        } else if (cleanUrl.match(/\.png$/i)) {
            return 'image/png';
        } else if (cleanUrl.match(/\.(jpg|jpeg)$/i)) {
            return 'image/jpeg';
        } else if (cleanUrl.match(/\.gif$/i)) {
            return 'image/gif';
        } else if (cleanUrl.match(/\.svg$/i)) {
            return 'image/svg+xml';
        } else if (cleanUrl.match(/\.webp$/i)) {
            return 'image/webp';
        } else if (cleanUrl.match(/\.(woff|woff2)$/i)) {
            return 'font/woff2';
        } else if (cleanUrl.match(/\.ttf$/i)) {
            return 'font/ttf';
        } else if (cleanUrl.match(/\.eot$/i)) {
            return 'application/vnd.ms-fontobject';
        } else if (cleanUrl.match(/\.ico$/i)) {
            return 'image/x-icon';
        } else if (cleanUrl.match(/\.json$/i)) {
            return 'application/json; charset=utf-8';
        } else if (cleanUrl.match(/\.xml$/i)) {
            return 'application/xml; charset=utf-8';
        } else if (cleanUrl.match(/\.html?$/i)) {
            return 'text/html; charset=utf-8';
        } else {
            // 基于URL路径模式推断
            if (url.includes('/_next/static/css/') || url.includes('.css')) {
                return 'text/css; charset=utf-8';
            } else if (url.includes('/_next/static/chunks/') || url.includes('/_next/static/') || url.includes('.js')) {
                return 'application/javascript; charset=utf-8';
            } else if (url.includes('fonts.googleapis.com')) {
                return 'text/css; charset=utf-8';
            } else if (url.includes('googletagmanager.com') && url.includes('.js')) {
                return 'application/javascript; charset=utf-8';
            }
            return 'text/plain; charset=utf-8';
        }
    }

    // 代理API请求 - 使用HTTP客户端而不是FlareSolverr
    async proxyApiRequest(accountId, apiPath, method = 'GET', data = null, headers = {}) {
        const session = this.getSession(accountId);
        if (!session) {
            throw new Error(`No session found for account: ${accountId}`);
        }

        const httpClient = this.httpClients.get(accountId);
        if (!httpClient) {
            throw new Error(`No HTTP client found for account: ${accountId}`);
        }

        const fullUrl = `https://www.midjourney.com/api${apiPath}`;

        try {
            logger.info(`Proxying API request via HTTP: ${method} ${fullUrl}`);
            
            let response;
            const requestConfig = {
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                validateStatus: function (status) {
                    return status >= 200 && status < 500; // 允许API错误状态码
                }
            };

            if (method.toUpperCase() === 'POST') {
                response = await httpClient.post(fullUrl, data, requestConfig);
            } else if (method.toUpperCase() === 'PUT') {
                response = await httpClient.put(fullUrl, data, requestConfig);
            } else if (method.toUpperCase() === 'DELETE') {
                response = await httpClient.delete(fullUrl, requestConfig);
            } else {
                response = await httpClient.get(fullUrl, requestConfig);
            }

            return {
                data: response.data,
                headers: response.headers || {},
                status: response.status
            };
        } catch (error) {
            logger.error(`Failed to proxy API request ${apiPath} via HTTP:`, error);
            
            // 如果API请求被Cloudflare拦截，可能需要刷新会话
            if (error.response && error.response.status === 403) {
                logger.warn(`API request blocked by Cloudflare, may need to refresh session: ${fullUrl}`);
            }
            
            throw error;
        }
    }

    // 重写URL以便代理
    rewriteUrls(html, $, accountId) {
        // 重写样式表链接
        $('link[rel="stylesheet"]').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href) {
                let newHref;
                const separator = href.includes('?') ? '&' : '?';
                if (href.startsWith('//')) {
                    newHref = `/api/mirror/static/https:${href}${separator}accountId=${accountId}`;
                } else if (href.startsWith('http')) {
                    newHref = `/api/mirror/static/${href}${separator}accountId=${accountId}`;
                } else if (href.startsWith('/')) {
                    newHref = `/api/mirror/static${href}${separator}accountId=${accountId}`;
                } else {
                    newHref = `/api/mirror/static/${href}${separator}accountId=${accountId}`;
                }
                $(elem).attr('href', newHref);
                logger.debug(`Rewritten CSS: ${href} -> ${newHref}`);
            }
        });

        // 重写脚本链接（包括Next.js chunk文件）
        $('script[src]').each((i, elem) => {
            const src = $(elem).attr('src');
            if (src) {
                let newSrc;
                const separator = src.includes('?') ? '&' : '?';
                if (src.startsWith('//')) {
                    newSrc = `/api/mirror/static/https:${src}${separator}accountId=${accountId}`;
                } else if (src.startsWith('http')) {
                    newSrc = `/api/mirror/static/${src}${separator}accountId=${accountId}`;
                } else if (src.startsWith('/')) {
                    newSrc = `/api/mirror/static${src}${separator}accountId=${accountId}`;
                } else {
                    newSrc = `/api/mirror/static/${src}${separator}accountId=${accountId}`;
                }
                $(elem).attr('src', newSrc);
                logger.debug(`Rewritten JS: ${src} -> ${newSrc}`);
            }
        });

        // 跳过图片链接，让它们直接从官网加载
        // 不重写img标签的src，让浏览器直接请求官网CDN

        // 重写其他链接（但跳过图片）
        $('a[href]').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
                if (href.startsWith('//')) {
                    $(elem).attr('href', `/explore${href}`); // 使用美化后的路径
                } else if (href.startsWith('http')) {
                    $(elem).attr('href', `/explore?redirect=${encodeURIComponent(href)}`);
                } else if (href.startsWith('/') && !href.startsWith('/api/')) {
                    $(elem).attr('href', `/explore${href}`);
                }
            }
        });

        // 注入代理脚本
        const proxyScript = `
<script>
(function() {
    console.log('FlareSolverr mirror proxy initializing for account: ${accountId}');
    
    // 重写fetch
    const originalFetch = window.fetch;
    window.fetch = function(url, options = {}) {
        if (typeof url === 'string') {
            console.log('Intercepting fetch:', url);
            if (url.startsWith('/api/') || url.includes('midjourney.com/api/')) {
                url = url.replace(/https?:\\/\\/(www\\.)?midjourney\\.com\\/api\\//g, '/api/mirror/mj-api/');
                if (url.startsWith('/api/') && !url.startsWith('/api/mirror/')) {
                    url = '/api/mirror/mj-api' + url;
                }
            }
            options.headers = options.headers || {};
            options.headers['X-Mirror-Account-ID'] = '${accountId}';
            options.headers['X-Mirror-Method'] = 'flaresolverr';
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
                console.log('Intercepting XHR:', url);
                if (url.startsWith('/api/') || url.includes('midjourney.com/api/')) {
                    url = url.replace(/https?:\\/\\/(www\\.)?midjourney\\.com\\/api\\//g, '/api/mirror/mj-api/');
                    if (url.startsWith('/api/') && !url.startsWith('/api/mirror/')) {
                        url = '/api/mirror/mj-api' + url;
                    }
                }
            }
            originalOpen.call(this, method, url, ...args);
            xhr.setRequestHeader('X-Mirror-Account-ID', '${accountId}');
            xhr.setRequestHeader('X-Mirror-Method', 'flaresolverr');
        };
        return xhr;
    };

    // 重写document.createElement以处理动态创建的元素
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName) {
        const element = originalCreateElement.call(document, tagName);
        
        if (tagName.toLowerCase() === 'script') {
            const originalSetAttribute = element.setAttribute;
            element.setAttribute = function(name, value) {
                if (name === 'src' && value) {
                    console.log('Intercepting dynamic script:', value);
                    // 处理Next.js chunk文件和其他JS文件
                    if (value.startsWith('/_next/') || value.startsWith('/static/') || 
                        (value.startsWith('/') && (value.endsWith('.js') || value.includes('.js?')))) {
                        value = '/api/mirror/static' + value + (value.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                        console.log('Rewritten dynamic script to:', value);
                    } else if (value.startsWith('http') && (value.endsWith('.js') || value.includes('.js?'))) {
                        value = '/api/mirror/static/' + value + (value.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                        console.log('Rewritten external script to:', value);
                    }
                }
                originalSetAttribute.call(element, name, value);
            };
            
            // 处理直接设置src属性的情况
            Object.defineProperty(element, 'src', {
                set: function(value) {
                    if (value && (value.startsWith('/_next/') || value.startsWith('/static/') || 
                        (value.startsWith('/') && (value.endsWith('.js') || value.includes('.js?'))))) {
                        console.log('Intercepting dynamic script src:', value);
                        value = '/api/mirror/static' + value + (value.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                        console.log('Rewritten dynamic script src to:', value);
                    } else if (value && value.startsWith('http') && (value.endsWith('.js') || value.includes('.js?'))) {
                        console.log('Intercepting external script src:', value);
                        value = '/api/mirror/static/' + value + (value.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                        console.log('Rewritten external script src to:', value);
                    }
                    this.setAttribute('src', value);
                },
                get: function() {
                    return this.getAttribute('src');
                }
            });
        }
        
        if (tagName.toLowerCase() === 'link') {
            const originalSetAttribute = element.setAttribute;
            element.setAttribute = function(name, value) {
                if (name === 'href' && value && (value.endsWith('.css') || value.includes('.css?'))) {
                    console.log('Intercepting dynamic CSS:', value);
                    if (value.startsWith('/')) {
                        value = '/api/mirror/static' + value + (value.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                        console.log('Rewritten dynamic CSS to:', value);
                    } else if (value.startsWith('http')) {
                        value = '/api/mirror/static/' + value + (value.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                        console.log('Rewritten external CSS to:', value);
                    }
                }
                originalSetAttribute.call(element, name, value);
            };
        }
        
        return element;
    };

    // 拦截动态import()调用（用于代码分割）
    if (window.__webpack_require__) {
        console.log('Webpack detected, setting up module interception');
        const originalWebpackRequire = window.__webpack_require__;
        window.__webpack_require__ = function(moduleId) {
            return originalWebpackRequire.apply(this, arguments);
        };
    }

    // 监听资源加载错误并重试
    window.addEventListener('error', function(event) {
        if (event.target && (event.target.tagName === 'SCRIPT' || event.target.tagName === 'LINK')) {
            const src = event.target.src || event.target.href;
            console.log('Resource failed to load:', src);
            
            // 跳过已经代理过的资源和本地资源
            if (src && !src.includes('/api/mirror/static') && !event.target.dataset.retried) {
                let proxiedSrc;
                
                if (src.startsWith('http://localhost:3000/')) {
                    // 如果是本地localhost资源，转换为从Midjourney域名加载
                    const resourcePath = src.replace('http://localhost:3000', '');
                    proxiedSrc = '/api/mirror/static' + resourcePath + (resourcePath.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                    console.log('Converting localhost resource to Midjourney domain:', src, '->', proxiedSrc);
                } else if (src.startsWith('https://localhost:3000/')) {
                    // 处理HTTPS localhost情况
                    const resourcePath = src.replace('https://localhost:3000', '');
                    proxiedSrc = '/api/mirror/static' + resourcePath + (resourcePath.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                    console.log('Converting HTTPS localhost resource to Midjourney domain:', src, '->', proxiedSrc);
                } else if (src.startsWith('/')) {
                    // 相对路径资源
                    proxiedSrc = '/api/mirror/static' + src + (src.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                    console.log('Converting relative path to proxy:', src, '->', proxiedSrc);
                } else if (src.startsWith('http') && !src.includes('localhost')) {
                    // 外部HTTP资源（非localhost）
                    proxiedSrc = '/api/mirror/static/' + src + (src.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                    console.log('Converting external resource to proxy:', src, '->', proxiedSrc);
                } else {
                    console.log('Skipping resource (already handled or invalid):', src);
                    return;
                }
                
                if (proxiedSrc) {
                    // 标记已重试，避免无限循环
                    event.target.dataset.retried = 'true';
                    
                    if (event.target.tagName === 'SCRIPT') {
                        event.target.src = proxiedSrc;
                    } else {
                        event.target.href = proxiedSrc;
                    }
                    console.log('Retrying with proxy:', proxiedSrc);
                }
            } else if (src && src.includes('/api/mirror/static')) {
                console.log('Proxied resource also failed, giving up:', src);
            } else {
                console.log('Resource already retried or no src:', src);
            }
        }
    }, true);

    // 处理现有的script标签的动态加载（限制处理频率避免高CPU占用）
    let observerProcessing = false;
    const observer = new MutationObserver(function(mutations) {
        if (observerProcessing) return; // 避免重复处理
        observerProcessing = true;
        
        setTimeout(() => {
            mutations.forEach(function(mutation) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Element node
                        if (node.tagName === 'SCRIPT' && node.src && !node.dataset.processed) {
                            let src = node.src;
                            console.log('MutationObserver detected new script:', src);
                            if ((src.includes('/_next/') || src.startsWith('/static/') || 
                                (src.startsWith('/') && src.includes('.js'))) && 
                                !src.includes('/api/mirror/')) {
                                const newSrc = src.replace(window.location.origin, '');
                                node.src = '/api/mirror/static' + newSrc + (newSrc.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                                node.dataset.processed = 'true';
                                console.log('MutationObserver rewritten script to:', node.src);
                            }
                        }
                        
                        if (node.tagName === 'LINK' && node.href && node.rel === 'stylesheet' && !node.dataset.processed) {
                            let href = node.href;
                            console.log('MutationObserver detected new stylesheet:', href);
                            if ((href.includes('.css') || href.includes('/static/')) && !href.includes('/api/mirror/')) {
                                const newHref = href.replace(window.location.origin, '');
                                node.href = '/api/mirror/static' + newHref + (newHref.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                                node.dataset.processed = 'true';
                                console.log('MutationObserver rewritten stylesheet to:', node.href);
                            }
                        }
                        
                        // 处理子元素中的script和link标签（限制递归深度）
                        const scripts = node.querySelectorAll && node.querySelectorAll('script[src]:not([data-processed])');
                        const links = node.querySelectorAll && node.querySelectorAll('link[rel="stylesheet"]:not([data-processed])');
                        
                        if (scripts && scripts.length <= 10) { // 限制处理数量
                            scripts.forEach(function(script) {
                                let src = script.src;
                                console.log('MutationObserver detected nested script:', src);
                                if ((src.includes('/_next/') || src.startsWith('/static/') || 
                                    (src.startsWith('/') && src.includes('.js'))) && 
                                    !src.includes('/api/mirror/')) {
                                    const newSrc = src.replace(window.location.origin, '');
                                    script.src = '/api/mirror/static' + newSrc + (newSrc.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                                    script.dataset.processed = 'true';
                                    console.log('MutationObserver rewritten nested script to:', script.src);
                                }
                            });
                        }
                        
                        if (links && links.length <= 10) { // 限制处理数量
                            links.forEach(function(link) {
                                let href = link.href;
                                console.log('MutationObserver detected nested stylesheet:', href);
                                if ((href.includes('.css') || href.includes('/static/')) && !href.includes('/api/mirror/')) {
                                    const newHref = href.replace(window.location.origin, '');
                                    link.href = '/api/mirror/static' + newHref + (newHref.includes('?') ? '&' : '?') + 'accountId=${accountId}';
                                    link.dataset.processed = 'true';
                                    console.log('MutationObserver rewritten nested stylesheet to:', link.href);
                                }
                            });
                        }
                    }
                });
            });
            observerProcessing = false;
        }, 100); // 去抖动处理
    });

    // 开始监听DOM变化（优化配置以减少CPU占用）
    observer.observe(document, {
        childList: true,
        subtree: true,
        attributeFilter: ['src', 'href'] // 只监听src和href属性变化
    });
    
    // 5分钟后停止监听，避免长时间高CPU占用
    setTimeout(() => {
        observer.disconnect();
        console.log('MutationObserver disconnected after 5 minutes to prevent high CPU usage');
    }, 300000);
    
    console.log('FlareSolverr mirror proxy initialized for account: ${accountId}');
})();
</script>`;

        // 在head结束前注入脚本
        const headCloseIndex = html.indexOf('</head>');
        if (headCloseIndex !== -1) {
            return html.slice(0, headCloseIndex) + proxyScript + html.slice(headCloseIndex);
        }
        
        return html + proxyScript;
    }

    // 生成FlareSolverr错误页面
    generateFlareSolverrErrorPage() {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>FlareSolverr Service Required</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
        .error { background: #fff; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 600px; margin: 0 auto; }
        .error h2 { color: #e74c3c; margin-bottom: 20px; }
        .error p { color: #666; line-height: 1.6; margin-bottom: 15px; }
        .code { background: #f8f8f8; padding: 10px; border-radius: 5px; font-family: monospace; margin: 20px 0; }
        button { background: #3498db; color: white; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; font-size: 16px; }
        button:hover { background: #2980b9; }
        .steps { text-align: left; margin-top: 30px; }
        .steps li { margin-bottom: 10px; }
    </style>
</head>
<body>
    <div class="error">
        <h2>🚫 FlareSolverr Service Required</h2>
        <p>The Cloudflare bypass service (FlareSolverr) is not running. This service is required to access Cloudflare-protected websites.</p>
        
        <div class="steps">
            <h3>To start FlareSolverr:</h3>
            <ol>
                <li><strong>Using Docker:</strong></li>
                <div class="code">docker run -d --name=flaresolverr -p 8191:8191 --restart unless-stopped ghcr.io/flaresolverr/flaresolverr:latest</div>
                
                <li><strong>Or download from:</strong></li>
                <div class="code">https://github.com/FlareSolverr/FlareSolverr/releases</div>
                
                <li>Make sure FlareSolverr is running on <code>http://localhost:8191</code></li>
            </ol>
        </div>
        
        <button onclick="window.location.reload()">Retry After Starting FlareSolverr</button>
    </div>
</body>
</html>`;
    }

    // 清理会话
    cleanup(accountId = null) {
        if (accountId) {
            // 清理指定账号的会话
            if (this.sessions.has(accountId)) {
                this.flareSolverr.destroySession(accountId).catch(error => {
                    logger.error(`Error destroying FlareSolverr session for account ${accountId}:`, error);
                });
                this.sessions.delete(accountId);
                this.httpClients.delete(accountId); // 清理HTTP客户端
                logger.info(`Cleaned up FlareSolverr session and HTTP client for account: ${accountId}`);
            }
        } else {
            // 清理所有过期会话
            this.flareSolverr.cleanup();
            
            const now = Date.now();
            const maxAge = 1000 * 60 * 60; // 1小时

            for (const [accId, session] of this.sessions.entries()) {
                if (now - session.lastActivity.getTime() > maxAge) {
                    this.cleanup(accId);
                }
            }
        }
    }
}

module.exports = FlareMirrorService;