const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const UserAgent = require('user-agents');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');

// 应用隐身插件
puppeteer.use(StealthPlugin());

class ResourceFetcher {
    constructor() {
        this.browser = null;
        this.pages = new Map();
        this.cache = new NodeCache({ stdTTL: 3600 }); // 1小时缓存
        this.userAgent = new UserAgent();
        this.isInitialized = false;
    }

    // 初始化浏览器实例
    async initBrowser() {
        if (this.browser && !this.browser.process().killed) {
            return this.browser;
        }

        try {
            this.browser = await puppeteer.launch({
                headless: true, // 强制无头模式
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process',
                    '--disable-gpu',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-features=TranslateUI',
                    '--disable-blink-features=AutomationControlled',
                    '--disable-web-security',
                    '--disable-features=VizDisplayCompositor',
                    '--disable-ipc-flooding-protection'
                ],
                ignoreHTTPSErrors: true,
                timeout: 30000
            });

            logger.info('Browser initialized successfully in headless mode');
            this.isInitialized = true;
            return this.browser;
        } catch (error) {
            logger.error('Failed to initialize browser:', error);
            throw error;
        }
    }

    // 创建带有特定账号Cookie的页面
    async createAccountPage(accountId, cookies) {
        const browser = await this.initBrowser();
        const page = await browser.newPage();

        // 设置随机User-Agent
        const userAgent = this.userAgent.toString();
        await page.setUserAgent(userAgent);

        // 设置视口
        await page.setViewport({
            width: 1920,
            height: 1080,
            deviceScaleFactor: 1
        });

        // 设置额外请求头
        await page.setExtraHTTPHeaders({
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
            'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1'
        });

        // 绕过WebDriver检测
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            // 修改plugins长度
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            
            // 修改语言
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });
            
            // 伪造Chrome对象
            window.chrome = {
                runtime: {}
            };
            
            // 覆盖permissions查询
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) => (
                parameters.name === 'notifications' ?
                    Promise.resolve({ state: Notification.permission }) :
                    originalQuery(parameters)
            );
        });

        // 设置Cookie
        if (cookies) {
            try {
                const cookieArray = this.parseCookies(cookies);
                logger.info(`Parsed ${cookieArray.length} cookies for account ${accountId}`);
                
                for (const cookie of cookieArray) {
                    try {
                        await page.setCookie(cookie);
                        logger.debug(`Set cookie: ${cookie.name}`);
                    } catch (cookieError) {
                        logger.warn(`Failed to set cookie ${cookie.name}:`, cookieError.message);
                        // 继续处理其他cookie，不要因为一个cookie失败就停止
                    }
                }
            } catch (error) {
                logger.error('Error parsing or setting cookies:', error);
                // 不要因为cookie错误就失败，继续创建页面
            }
        }

        // 拦截请求以添加必要的头部
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const headers = request.headers();
            headers['sec-ch-ua'] = '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"';
            headers['sec-ch-ua-mobile'] = '?0';
            headers['sec-ch-ua-platform'] = '"macOS"';
            
            request.continue({ headers });
        });

        this.pages.set(accountId, page);
        logger.info(`Created page for account: ${accountId}`);
        return page;
    }

    // 解析Cookie字符串
    parseCookies(cookieString) {
        if (!cookieString) return [];
        
        return cookieString.split(';').map(cookie => {
            const trimmedCookie = cookie.trim();
            const equalIndex = trimmedCookie.indexOf('=');
            
            if (equalIndex === -1) return null;
            
            const name = trimmedCookie.substring(0, equalIndex).trim();
            const value = trimmedCookie.substring(equalIndex + 1).trim();
            
            if (!name || !value) return null;
            
            return {
                name: name,
                value: value,
                domain: '.midjourney.com',
                path: '/',
                secure: true,
                httpOnly: name.includes('__Host-') || name.includes('__Secure-'),
                sameSite: 'None'
            };
        }).filter(cookie => cookie !== null);
    }

    // 抓取静态资源
    async fetchResource(url, accountId, options = {}) {
        const cacheKey = `${accountId}_${url}`;
        
        // 检查缓存
        if (this.cache.has(cacheKey) && !options.bypassCache) {
            logger.info(`Cache hit for: ${url}`);
            return this.cache.get(cacheKey);
        }

        try {
            let page = this.pages.get(accountId);
            
            if (!page) {
                throw new Error(`Page not found for account: ${accountId}`);
            }

            // 导航到目标URL
            const response = await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });

            if (!response) {
                throw new Error('No response received');
            }

            // 等待页面完全加载
            await page.waitForTimeout(2000);

            // 获取页面内容
            const content = await page.content();
            const status = response.status();
            const headers = response.headers();

            const result = {
                content,
                status,
                headers,
                url: response.url(),
                timestamp: Date.now()
            };

            // 缓存结果
            this.cache.set(cacheKey, result);
            
            logger.info(`Successfully fetched resource: ${url}, status: ${status}`);
            return result;

        } catch (error) {
            logger.error(`Failed to fetch resource ${url}:`, error);
            
            // 如果是CF挑战，尝试处理
            if (error.message.includes('challenge') || error.message.includes('cloudflare')) {
                return await this.handleCloudflareChallenge(url, accountId);
            }
            
            throw error;
        }
    }

    // 处理Cloudflare挑战
    async handleCloudflareChallenge(url, accountId) {
        logger.info(`Handling Cloudflare challenge for: ${url}`);
        
        try {
            const page = this.pages.get(accountId);
            
            // 等待挑战完成
            await page.waitForTimeout(5000);
            
            // 检查是否有挑战页面元素
            const challengeExists = await page.$('.cf-challenge-running');
            if (challengeExists) {
                logger.info('Waiting for Cloudflare challenge to complete...');
                await page.waitForSelector('.cf-challenge-running', { 
                    hidden: true, 
                    timeout: 30000 
                });
            }

            // 重新尝试获取内容
            const content = await page.content();
            const currentUrl = page.url();
            
            return {
                content,
                status: 200,
                headers: { 'content-type': 'text/html' },
                url: currentUrl,
                timestamp: Date.now(),
                challengeHandled: true
            };

        } catch (error) {
            logger.error('Failed to handle Cloudflare challenge:', error);
            throw error;
        }
    }

    // 获取页面的所有资源链接
    async extractResourceLinks(accountId) {
        try {
            const page = this.pages.get(accountId);
            if (!page) {
                throw new Error(`Page not found for account: ${accountId}`);
            }

            const resources = await page.evaluate(() => {
                const links = [];
                
                // 获取所有样式表
                document.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
                    if (link.href) links.push({ type: 'css', url: link.href });
                });
                
                // 获取所有脚本
                document.querySelectorAll('script[src]').forEach(script => {
                    if (script.src) links.push({ type: 'js', url: script.src });
                });
                
                // 获取所有图片
                document.querySelectorAll('img[src]').forEach(img => {
                    if (img.src) links.push({ type: 'image', url: img.src });
                });
                
                // 获取所有字体
                const stylesheets = document.styleSheets;
                for (let i = 0; i < stylesheets.length; i++) {
                    try {
                        const rules = stylesheets[i].cssRules || stylesheets[i].rules;
                        for (let j = 0; j < rules.length; j++) {
                            const rule = rules[j];
                            if (rule.style && rule.style.fontFamily) {
                                // 这里可以进一步解析字体URL
                            }
                        }
                    } catch (e) {
                        // 跨域CSS规则无法访问，忽略
                    }
                }
                
                return links;
            });

            logger.info(`Extracted ${resources.length} resource links`);
            return resources;

        } catch (error) {
            logger.error('Failed to extract resource links:', error);
            return [];
        }
    }

    // 清理资源
    async cleanup(accountId) {
        try {
            if (accountId && this.pages.has(accountId)) {
                const page = this.pages.get(accountId);
                await page.close();
                this.pages.delete(accountId);
                logger.info(`Cleaned up page for account: ${accountId}`);
            }
        } catch (error) {
            logger.error('Error during cleanup:', error);
        }
    }

    // 关闭浏览器
    async closeBrowser() {
        try {
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.pages.clear();
                logger.info('Browser closed successfully');
            }
        } catch (error) {
            logger.error('Error closing browser:', error);
        }
    }
}

module.exports = ResourceFetcher;