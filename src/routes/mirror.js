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

// Apply authentication middleware to most routes, but not static resources
const conditionalAuth = (req, res, next) => {
    // Skip auth for static resources if they have a valid accountId parameter
    if (req.path.startsWith('/static/')) {
        const accountId = req.query.accountId || req.headers['x-mirror-account-id'];
        if (accountId) {
            console.log(`Skipping auth for static resource: ${req.path} with accountId: ${accountId}`);
            return next();
        }
    }
    
    // Apply normal auth for all other routes
    console.log(`Applying auth for: ${req.path}`);
    return authMiddleware(req, res, next);
};

router.use(conditionalAuth);

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
        
        // Create session manager session
        const session = sessionManager.createSession(
            req.user.userId,
            accountId,
            req.ip,
            req.headers['user-agent']
        );

        // Create FlareSolverr mirror session
        await flareMirrorService.createSession(accountId, account.cookies);

        logger.info(`FlareSolverr Mirror session created: ${session.id} for account: ${accountId}`);

        res.json({
            success: true,
            sessionId: session.id,
            method: 'flaresolverr',
            message: 'FlareSolverr Mirror session created successfully'
        });

    } catch (error) {
        logger.error('Error creating HTTP mirror session:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create mirror session: ' + error.message
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

        // Fetch content using FlareSolverr service
        const result = await flareMirrorService.fetchPage(accountId);

        res.json({
            success: true,
            content: result.content,
            status: result.status,
            url: result.url,
            method: 'flaresolverr',
            challenge: result.challenge || false
        });

    } catch (error) {
        logger.error('Error fetching HTTP mirror content:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch mirror content: ' + error.message
        });
    }
});

// Proxy static resources
router.get('/static/*', async (req, res) => {
    try {
        const accountId = req.headers['x-mirror-account-id'] || req.query.accountId;
        let resourcePath = req.path.replace('/static/', ''); // 移除/static/前缀

        if (!accountId) {
            return res.status(400).json({
                success: false,
                message: 'Account ID is required'
            });
        }

        // 解码URL，处理编码的URL
        resourcePath = decodeURIComponent(resourcePath);
        
        logger.info(`Static resource request: ${resourcePath} for account: ${accountId}`);

        const result = await flareMirrorService.proxyStaticResource(accountId, resourcePath);

        // 设置正确的Content-Type
        if (result.headers['content-type']) {
            res.set('Content-Type', result.headers['content-type']);
        }
        
        // 设置缓存头
        res.set('Cache-Control', 'public, max-age=3600');
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Headers', 'X-Mirror-Account-ID, X-Mirror-Method');

        // 如果是二进制数据（如图片、字体），需要正确处理
        if (Buffer.isBuffer(result.data)) {
            res.status(result.status).send(result.data);
        } else if (typeof result.data === 'string') {
            // 对于文本资源（CSS、JS），可能需要进一步处理
            let processedData = result.data;
            
            // 如果是CSS文件，重写其中的URL引用
            if (result.headers['content-type'] && result.headers['content-type'].includes('text/css')) {
                processedData = processedData.replace(
                    /url\((['"]?)([^'")]+)\1\)/g,
                    (match, quote, url) => {
                        if (url.startsWith('http') || url.startsWith('//')) {
                            return `url(${quote}/api/mirror/static/${url}?accountId=${accountId}${quote})`;
                        } else if (url.startsWith('/')) {
                            return `url(${quote}/api/mirror/static${url}?accountId=${accountId}${quote})`;
                        }
                        return match;
                    }
                );
                logger.debug(`Processed CSS URLs for: ${resourcePath}`);
            }
            
            res.status(result.status).send(processedData);
        } else {
            res.status(result.status).send(result.data);
        }

    } catch (error) {
        logger.error('Error proxying static resource:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to proxy static resource: ' + error.message
        });
    }
});

// Proxy API requests
router.all('/mj-api/*', async (req, res) => {
    try {
        const accountId = req.headers['x-mirror-account-id'];
        const apiPath = req.path.replace('/mj-api', '');

        if (!accountId) {
            return res.status(400).json({
                success: false,
                message: 'Account ID is required in headers'
            });
        }

        const result = await flareMirrorService.proxyApiRequest(
            accountId,
            apiPath,
            req.method,
            req.body,
            req.headers
        );

        // 复制响应头
        Object.keys(result.headers).forEach(key => {
            if (!key.toLowerCase().startsWith('transfer-encoding')) {
                res.set(key, result.headers[key]);
            }
        });

        // 设置CORS头
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mirror-Account-ID');

        res.status(result.status).json(result.data);

    } catch (error) {
        logger.error('Error proxying API request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to proxy API request: ' + error.message
        });
    }
});

// Handle OPTIONS requests for CORS
router.options('/mj-api/*', (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Mirror-Account-ID');
    res.status(204).send();
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

        // Clean up FlareSolverr mirror session
        flareMirrorService.cleanup(session.accountId);
        
        // Clean up session manager session
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
            method: 'flaresolverr',
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