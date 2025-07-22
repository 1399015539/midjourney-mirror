const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Authentication middleware
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access denied. No token provided.'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
        req.user = decoded;
        next();
    } catch (error) {
        logger.warn(`Invalid token attempt: ${error.message}`);
        res.status(401).json({
            success: false,
            message: 'Invalid token.'
        });
    }
}

module.exports = authMiddleware;