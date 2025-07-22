const express = require('express');
const router = express.Router();
const ResourceFetcher = require('../services/resourceFetcher');
const SimpleMirrorService = require('../services/simpleMirrorService');
const APIProxy = require('../services/apiProxy');
const SessionManager = require('../services/sessionManager');
const AccountManager = require('../services/accountManager');
const logger = require('../utils/logger');
const authMiddleware = require('../middleware/auth');

const resourceFetcher = new ResourceFetcher();
const simpleMirrorService = new SimpleMirrorService();
const apiProxy = new APIProxy();
const sessionManager = new SessionManager();
const accountManager = new AccountManager();

// 检查是否启用测试模式
const TEST_MODE = process.env.TEST_MODE === 'true' || process.env.NODE_ENV === 'development';

// Apply authentication middleware
router.use(authMiddleware);

// Create mirror session
router.post('/session', async (req, res) => {
    try {
        const { accountId } = req.body;

        if (!accountId) {
            return res.status(400).json({
                success: false,
                message: 'Account ID is required'
            });
        }

        // Validate account
        const validation = accountManager.validateAccount(accountId);
        if (!validation.valid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const account = validation.account;
        
        // Create session
        const session = sessionManager.createSession(
            req.user.userId,
            accountId,
            req.ip,
            req.headers['user-agent']
        );

        if (TEST_MODE) {
            // 测试模式：使用简化服务
            logger.info(`Mirror session created in TEST MODE: ${session.id} for account: ${accountId}`);
            const testSession = await simpleMirrorService.createTestSession(accountId);
            
            res.json({
                success: true,
                sessionId: session.id,
                testMode: true,
                message: 'Mirror session created successfully (Test Mode)'
            });
        } else {
            // 生产模式：使用真实Puppeteer
            try {
                await resourceFetcher.createAccountPage(accountId, account.cookies);
                logger.info(`Mirror session created: ${session.id} for account: ${accountId}`);
                
                res.json({
                    success: true,
                    sessionId: session.id,
                    message: 'Mirror session created successfully'
                });
            } catch (error) {
                logger.error('Error creating browser page:', error);
                
                // 如果Puppeteer失败，回退到测试模式
                logger.warn('Falling back to test mode due to browser error');
                const testSession = await simpleMirrorService.createTestSession(accountId);
                
                res.json({
                    success: true,
                    sessionId: session.id,
                    testMode: true,
                    fallback: true,
                    message: 'Mirror session created in test mode (browser error fallback)'
                });
            }
        }

    } catch (error) {
        logger.error('Error creating mirror session:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create mirror session'
        });
    }
});

// Get mirror content (initial page)
router.get('/content', async (req, res) => {
    try {
        const { accountId, sessionId } = req.query;

        if (!accountId || !sessionId) {
            return res.status(400).json({
                success: false,
                message: 'Account ID and Session ID are required'
            });
        }

        // Validate session
        const sessionValidation = sessionManager.validateSession(sessionId, req.user.userId);
        if (!sessionValidation.valid) {
            return res.status(401).json({
                success: false,
                message: sessionValidation.message
            });
        }

        // Update session activity
        sessionManager.updateActivity(sessionId);

        if (TEST_MODE) {
            // 测试模式：返回模拟内容
            const result = await simpleMirrorService.getTestContent(accountId);
            
            res.json({
                success: true,
                content: result.content,
                status: result.status,
                url: result.url,
                testMode: true
            });
        } else {
            // 生产模式：获取真实内容
            try {
                const result = await resourceFetcher.fetchResource(
                    'https://www.midjourney.com',
                    accountId
                );

                res.json({
                    success: true,
                    content: result.content,
                    status: result.status,
                    url: result.url
                });
            } catch (error) {
                logger.error('Error fetching real content, falling back to test mode:', error);
                
                // 回退到测试模式
                const result = await simpleMirrorService.getTestContent(accountId);
                
                res.json({
                    success: true,
                    content: result.content,
                    status: result.status,
                    url: result.url,
                    testMode: true,
                    fallback: true
                });
            }
        }

    } catch (error) {
        logger.error('Error fetching mirror content:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch mirror content: ' + error.message
        });
    }
});

// Proxy Midjourney API requests
router.use('/mj-api/*', (req, res, next) => {
    const accountId = req.headers['x-mirror-account-id'];
    const sessionId = req.headers['x-mirror-session-id'];

    if (!accountId || !sessionId) {
        return res.status(400).json({
            success: false,
            message: 'Missing mirror headers'
        });
    }

    // Validate session
    const sessionValidation = sessionManager.validateSession(sessionId, req.user.userId);
    if (!sessionValidation.valid) {
        return res.status(401).json({
            success: false,
            message: 'Invalid session'
        });
    }

    // Get account
    const account = accountManager.getAccountById(accountId);
    if (!account) {
        return res.status(404).json({
            success: false,
            message: 'Account not found'
        });
    }

    // Update session activity
    sessionManager.updateActivity(sessionId);

    // Create or get proxy for this account
    let proxy = apiProxy.getAccountProxy(accountId);
    if (!proxy) {
        proxy = apiProxy.createAccountProxy(accountId, account.cookies, account.userAgent);
    }

    // Apply proxy
    proxy(req, res, next);
});

// Proxy static resources
router.use('/static/*', (req, res, next) => {
    const proxy = apiProxy.createStaticProxy();
    proxy(req, res, next);
});

// Proxy CDN resources
router.use('/cdn/*', (req, res, next) => {
    const proxy = apiProxy.createCDNProxy();
    proxy(req, res, next);
});

// Handle WebSocket proxy
router.use('/ws', (req, res) => {
    const accountId = req.headers['x-mirror-account-id'];
    const sessionId = req.headers['x-mirror-session-id'];

    if (!accountId || !sessionId) {
        return res.status(400).json({
            success: false,
            message: 'Missing mirror headers'
        });
    }

    const account = accountManager.getAccountById(accountId);
    if (!account) {
        return res.status(404).json({
            success: false,
            message: 'Account not found'
        });
    }

    const wsProxy = apiProxy.createWebSocketProxy(accountId, account.cookies);
    wsProxy(req, res);
});

// Destroy mirror session
router.delete('/session/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        // Validate session ownership
        const sessionValidation = sessionManager.validateSession(sessionId, req.user.userId);
        if (!sessionValidation.valid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid session'
            });
        }

        const session = sessionValidation.session;

        // Clean up resources
        await resourceFetcher.cleanup(session.accountId);
        apiProxy.cleanupAccountProxy(session.accountId);
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

// Get session status
router.get('/session/:sessionId/status', (req, res) => {
    try {
        const { sessionId } = req.params;

        const sessionValidation = sessionManager.validateSession(sessionId, req.user.userId);
        
        res.json({
            success: true,
            valid: sessionValidation.valid,
            session: sessionValidation.session || null,
            message: sessionValidation.message || null
        });

    } catch (error) {
        logger.error('Error checking session status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check session status'
        });
    }
});

module.exports = router;