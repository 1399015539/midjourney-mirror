const axios = require('axios');
const logger = require('../utils/logger');

class FlareSolverrService {
    constructor(baseUrl = 'http://flaresolverr:8191/v1') {
        this.baseUrl = baseUrl;
        logger.info(`FlareSolverr service initialized with URL: ${this.baseUrl}`);
    }

    // 检查服务是否可用
    async healthCheck() {
        try {
            logger.info(`Checking FlareSolverr health at: ${this.baseUrl}`);
            const response = await axios.post(this.baseUrl, {
                cmd: 'sessions.list'
            }, {
                timeout: 10000,
                validateStatus: status => status === 200
            });

            const isHealthy = response.data && response.data.status === 'ok';
            if (isHealthy) {
                logger.info('FlareSolverr health check passed');
            } else {
                logger.error('FlareSolverr health check failed: Invalid response status');
            }
            return isHealthy;
        } catch (error) {
            logger.error('FlareSolverr health check failed:', error.message);
            return false;
        }
    }

    // 创建会话
    async createSession(sessionId) {
        try {
            // 先进行健康检查
            const isHealthy = await this.healthCheck();
            if (!isHealthy) {
                throw new Error('FlareSolverr service is not healthy');
            }

            const response = await axios.post(this.baseUrl, {
                cmd: 'sessions.create',
                session: sessionId
            }, {
                timeout: 10000,
                validateStatus: status => status === 200
            });

            if (response.data.status !== 'ok') {
                throw new Error(`Failed to create FlareSolverr session: ${response.data.message || 'Unknown error'}`);
            }

            logger.info(`Successfully created FlareSolverr session: ${sessionId}`);
            return true;
        } catch (error) {
            logger.error(`Error creating FlareSolverr session ${sessionId}:`, error.message);
            throw new Error(`Failed to create FlareSolverr session: ${error.message}`);
        }
    }

    // 发送请求
    async request(sessionId, url, method = 'GET', postData = null) {
        try {
            const requestData = {
                cmd: method.toLowerCase() === 'post' ? 'request.post' : 'request.get',
                url: url,
                session: sessionId,
                maxTimeout: 60000,
                cookies: []
            };

            if (method.toLowerCase() === 'post' && postData) {
                requestData.postData = postData;
            }

            const response = await axios.post(this.baseUrl, requestData, {
                timeout: 70000,
                validateStatus: status => status === 200
            });

            if (response.data.status !== 'ok') {
                throw new Error(`FlareSolverr request failed: ${response.data.message || 'Unknown error'}`);
            }

            logger.info(`Successfully completed FlareSolverr request for session ${sessionId}`);
            return response.data.solution;
        } catch (error) {
            logger.error(`FlareSolverr request error for session ${sessionId}:`, error.message);
            throw new Error(`FlareSolverr request failed: ${error.message}`);
        }
    }

    // 销毁会话
    async destroySession(sessionId) {
        try {
            const response = await axios.post(this.baseUrl, {
                cmd: 'sessions.destroy',
                session: sessionId
            }, {
                timeout: 5000,
                validateStatus: status => status === 200
            });

            const success = response.data.status === 'ok';
            if (success) {
                logger.info(`Successfully destroyed FlareSolverr session: ${sessionId}`);
            } else {
                logger.warn(`Failed to destroy FlareSolverr session ${sessionId}: ${response.data.message || 'Unknown error'}`);
            }
            return success;
        } catch (error) {
            logger.error(`Error destroying FlareSolverr session ${sessionId}:`, error.message);
            return false;
        }
    }
}

module.exports = FlareSolverrService;