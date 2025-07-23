const express = require('express');
const router = express.Router();
const FlareMirrorService = require('../services/flareMirrorService');
const SessionManager = require('../services/sessionManager');
const AccountManager = require('../services/accountManager');
const logger = require('../utils/logger');
const authMiddleware = require('../middleware/auth');

const flareMirrorService = new FlareMirrorService();
const sessionManager = new SessionManager();
const accountManager = new AccountManager();

// 静态资源路由处理
router.get('/static/*', async (req, res) => {
    try {
        const accountId = req.query.accountId || req.headers['x-mirror-account-id'];
        if (!accountId) {
            return res.status(400).json({
                success: false,
                message: 'Account ID is required'
            });
        }

        let resourcePath = req.path.replace('/static/', '');
        resourcePath = decodeURIComponent(resourcePath);

        logger.info(`Static resource request: ${resourcePath} for account: ${accountId}`);

        const result = await flareMirrorService.proxyStaticResource(accountId, resourcePath);

        // 设置响应头
        if (result.headers) {
            Object.entries(result.headers).forEach(([key, value]) => {
                try {
                    res.set(key, value);
                } catch (error) {
                    logger.warn(`Failed to set header ${key}:`, error.message);
                }
            });
        }

        // 确保正确的内容类型
        const contentType = result.headers['content-type'];
        if (contentType) {
            res.type(contentType);
        }

        // 设置缓存控制
        res.set({
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Mirror-Account-ID, X-Mirror-Session-ID'
        });

        // 发送响应
        res.status(result.status).send(result.data);

    } catch (error) {
        logger.error('Error proxying static resource:', error);
        
        // 返回更详细的错误信息
        res.status(error.status || 500).json({
            success: false,
            message: error.message || 'Failed to proxy static resource',
            path: req.path,
            error: error.toString()
        });
    }
});

// API路由处理
router.all('/api/*', authMiddleware, async (req, res) => {
    try {
        const accountId = req.headers['x-mirror-account-id'];
        const sessionId = req.headers['x-mirror-session-id'];

        if (!accountId || !sessionId) {
            return res.status(400).json({
                success: false,
                message: 'Account ID and Session ID are required'
            });
        }

        // 验证会话
        const sessionValidation = sessionManager.validateSession(sessionId, req.user.userId);
        if (!sessionValidation.valid) {
            return res.status(401).json({
                success: false,
                message: sessionValidation.message
            });
        }

        // 更新会话活动
        sessionManager.updateActivity(sessionId);

        // 代理API请求
        const apiPath = req.path.replace('/api', '');
        const result = await flareMirrorService.proxyApiRequest(
            accountId,
            apiPath,
            req.method,
            req.body,
            req.headers
        );

        // 设置响应头
        Object.entries(result.headers || {}).forEach(([key, value]) => {
            if (!key.toLowerCase().startsWith('transfer-encoding')) {
                res.set(key, value);
            }
        });

        res.status(result.status).send(result.data);

    } catch (error) {
        logger.error('Error proxying API request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to proxy API request'
        });
    }
});

// 创建镜像会话
router.post('/session', authMiddleware, async (req, res) => {
    try {
        const { accountId } = req.body;

        if (!accountId) {
            return res.status(400).json({
                success: false,
                message: 'Account ID is required'
            });
        }

        // 验证账号
        const validation = accountManager.validateAccount(accountId);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const account = validation.account;
        
        // 创建会话
        const session = sessionManager.createSession(
            req.user.userId,
            accountId,
            req.ip,
            req.headers['user-agent']
        );

        // 创建FlareSolverr会话
        await flareMirrorService.createSession(accountId, account.cookies);

        logger.info(`Mirror session created: ${session.id} for account: ${accountId}`);

        res.json({
            success: true,
            sessionId: session.id,
            message: 'Mirror session created successfully'
        });

    } catch (error) {
        logger.error('Error creating mirror session:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create mirror session'
        });
    }
});

// 获取镜像内容
router.get('/content', authMiddleware, async (req, res) => {
    try {
        const { accountId, sessionId } = req.query;

        if (!accountId || !sessionId) {
            return res.status(400).json({
                success: false,
                message: 'Account ID and Session ID are required'
            });
        }

        // 验证会话
        const sessionValidation = sessionManager.validateSession(sessionId, req.user.userId);
        if (!sessionValidation.valid) {
            return res.status(401).json({
                success: false,
                message: sessionValidation.message
            });
        }

        // 更新会话活动
        sessionManager.updateActivity(sessionId);

        // 获取页面内容
        const result = await flareMirrorService.fetchPage(accountId);

        res.json({
            success: true,
            content: result.content,
            status: result.status,
            url: result.url
        });

    } catch (error) {
        logger.error('Error fetching mirror content:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch mirror content'
        });
    }
});

// 销毁会话
router.delete('/session/:sessionId', authMiddleware, async (req, res) => {
    try {
        const { sessionId } = req.params;

        // 验证会话所有权
        const sessionValidation = sessionManager.validateSession(sessionId, req.user.userId);
        if (!sessionValidation.valid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid session'
            });
        }

        const session = sessionValidation.session;

        // 清理资源
        await flareMirrorService.destroySession(session.accountId);
        sessionManager.destroySession(sessionId);

        res.json({
            success: true,
            message: 'Mirror session destroyed successfully'
        });

    } catch (error) {
        logger.error('Error destroying mirror session:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to destroy mirror session'
        });
    }
});

module.exports = router;