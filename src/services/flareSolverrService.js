const axios = require('axios');
const logger = require('../utils/logger');

class FlareSolverrService {
    constructor(flareSolverrUrl = 'http://localhost:8191') {
        this.flareSolverrUrl = flareSolverrUrl;
        this.sessions = new Map(); // accountId -> session info
    }

    // 创建FlareSolverr会话
    async createSession(accountId, cookies = null) {
        try {
            const sessionId = `session_${accountId}_${Date.now()}`;
            
            const requestData = {
                cmd: 'sessions.create',
                session: sessionId
            };

            logger.info(`Creating FlareSolverr session: ${sessionId} for account: ${accountId}`);
            
            const response = await axios.post(`${this.flareSolverrUrl}/v1`, requestData, {
                timeout: 30000
            });

            if (response.data.status === 'ok') {
                // 创建会话对象
                const session = {
                    sessionId,
                    accountId,
                    createdAt: new Date(),
                    lastActivity: new Date()
                };

                this.sessions.set(accountId, session);
                
                // 如果有cookies，先访问首页建立连接，然后设置cookies
                if (cookies) {
                    await this.setCookies(sessionId, cookies);
                }

                logger.info(`FlareSolverr session created successfully: ${sessionId}`);
                return session;
            } else {
                throw new Error(`Failed to create session: ${response.data.message}`);
            }
        } catch (error) {
            logger.error(`Failed to create FlareSolverr session for account ${accountId}:`, error);
            throw error;
        }
    }

    // 设置Cookies到会话
    async setCookies(sessionId, cookieString) {
        try {
            if (!cookieString) return;

            logger.info(`Setting cookies for session: ${sessionId}`);

            // 解析cookie字符串
            const cookies = this.parseCookies(cookieString);
            logger.info(`Parsed ${cookies.length} cookies`);
            
            // 先访问首页建立基础会话
            logger.info('First accessing main page to establish session...');
            const firstRequest = {
                cmd: 'request.get',
                url: 'https://www.midjourney.com',
                session: sessionId,
                maxTimeout: 60000
            };

            await axios.post(`${this.flareSolverrUrl}/v1`, firstRequest, {
                timeout: 70000
            });

            // 然后设置cookies并访问explore页面验证登录状态
            logger.info('Setting cookies and accessing explore page...');
            const requestData = {
                cmd: 'request.get',
                url: 'https://www.midjourney.com/explore',
                session: sessionId,
                maxTimeout: 60000,
                cookies: cookies.map(cookieStr => {
                    const [nameValue] = cookieStr.split(';'); // 取第一部分
                    const [name, value] = nameValue.split('=');
                    return {
                        name: name.trim(),
                        value: value ? value.trim() : '',
                        domain: '.midjourney.com',
                        path: '/',
                        httpOnly: name.includes('AuthUserToken'), // 登录token应该是httpOnly
                        secure: true
                    };
                })
            };

            const response = await axios.post(`${this.flareSolverrUrl}/v1`, requestData, {
                timeout: 70000
            });

            if (response.data.status === 'ok') {
                logger.info(`Cookies set successfully for session: ${sessionId}`);
                // 检查是否成功访问了explore页面（已登录状态）
                const content = response.data.solution?.response || '';
                if (content.includes('explore') || content.includes('user') || content.includes('dashboard')) {
                    logger.info('Successfully established logged-in session');
                } else {
                    logger.warn('May not be in logged-in state, but continuing...');
                }
            } else {
                logger.warn(`Failed to set cookies for session ${sessionId}: ${response.data.message}`);
            }
        } catch (error) {
            logger.error(`Error setting cookies for session ${sessionId}:`, error.message);
            // 不抛出错误，因为cookie设置失败不应该阻止会话创建
        }
    }

    // 发送请求
    async request(sessionId, url, method = 'GET', postData = null) {
        try {
            const requestData = {
                cmd: 'request.get',
                url: url,
                session: sessionId,
                maxTimeout: 60000
            };

            if (method === 'POST' && postData) {
                requestData.cmd = 'request.post';
                requestData.postData = postData;
            }

            logger.info(`FlareSolverr request: ${method} ${url} (session: ${sessionId})`);

            const response = await axios.post(`${this.flareSolverrUrl}/v1`, requestData, {
                timeout: 70000
            });

            if (response.data.status === 'ok') {
                const solution = response.data.solution;
                
                // 更新会话活动时间
                const session = Array.from(this.sessions.values()).find(s => s.sessionId === sessionId);
                if (session) {
                    session.lastActivity = new Date();
                }

                // 处理二进制内容
                let content = solution.response;
                
                // 检查是否是二进制内容类型
                const contentType = solution.headers && solution.headers['content-type'];
                const isBinary = contentType && (
                    contentType.includes('image/') ||
                    contentType.includes('font/') ||
                    contentType.includes('application/octet-stream') ||
                    contentType.includes('application/pdf')
                );

                // 如果FlareSolverr返回的是base64编码的二进制数据
                if (isBinary && typeof content === 'string' && content.length > 100) {
                    try {
                        content = Buffer.from(content, 'base64');
                        logger.debug(`Converted base64 content to Buffer for ${url}`);
                    } catch (error) {
                        logger.warn(`Failed to convert base64 content for ${url}:`, error);
                        // 保持原始内容
                    }
                }

                return {
                    status: solution.status,
                    url: solution.url,
                    headers: solution.headers || {},
                    cookies: solution.cookies || [],
                    content: content,
                    userAgent: solution.userAgent,
                    timestamp: Date.now()
                };
            } else {
                throw new Error(`FlareSolverr request failed: ${response.data.message}`);
            }
        } catch (error) {
            logger.error(`FlareSolverr request error (${method} ${url}):`, error);
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

    // 销毁会话
    async destroySession(accountId) {
        const session = this.sessions.get(accountId);
        if (!session) {
            logger.warn(`No session found for account ${accountId} to destroy`);
            return;
        }

        try {
            const requestData = {
                cmd: 'sessions.destroy',
                session: session.sessionId
            };

            await axios.post(`${this.flareSolverrUrl}/v1`, requestData, {
                timeout: 10000
            });

            this.sessions.delete(accountId);
            logger.info(`FlareSolverr session destroyed: ${session.sessionId}`);
        } catch (error) {
            logger.error(`Failed to destroy FlareSolverr session ${session.sessionId}:`, error);
            // 仍然从内存中移除
            this.sessions.delete(accountId);
        }
    }

    // 检查FlareSolverr是否运行
    async healthCheck() {
        try {
            logger.info(`Checking FlareSolverr health at: ${this.flareSolverrUrl}`);
            
            // FlareSolverr需要POST请求，发送一个简单的命令来检查状态
            const response = await axios.post(`${this.flareSolverrUrl}/v1`, {
                cmd: 'sessions.list'
            }, {
                timeout: 5000
            });
            
            logger.info(`FlareSolverr health check response: ${response.status}, data:`, response.data);
            return response.status === 200 && response.data.status === 'ok';
        } catch (error) {
            logger.error(`FlareSolverr health check failed at ${this.flareSolverrUrl}:`, error.message);
            if (error.response) {
                logger.error(`Response status: ${error.response.status}`);
                logger.error(`Response data:`, error.response.data);
            }
            if (error.code) {
                logger.error(`Error code: ${error.code}`);
            }
            return false;
        }
    }

    // 解析Cookie字符串
    parseCookies(cookieString) {
        if (!cookieString) return [];
        
        return cookieString.split(';').map(cookie => {
            const trimmed = cookie.trim();
            if (!trimmed) return null;
            
            const equalIndex = trimmed.indexOf('=');
            if (equalIndex === -1) return trimmed; // 可能是标志位
            
            const name = trimmed.substring(0, equalIndex).trim();
            const value = trimmed.substring(equalIndex + 1).trim();
            
            if (!name) return null;
            
            return `${name}=${value}`;
        }).filter(cookie => cookie !== null);
    }

    // 清理过期会话
    cleanup() {
        const now = Date.now();
        const maxAge = 1000 * 60 * 60; // 1小时

        for (const [accountId, session] of this.sessions.entries()) {
            if (now - session.lastActivity.getTime() > maxAge) {
                logger.info(`Cleaning up expired session for account: ${accountId}`);
                this.destroySession(accountId).catch(error => {
                    logger.error(`Error cleaning up session for account ${accountId}:`, error);
                });
            }
        }
    }
}

module.exports = FlareSolverrService;