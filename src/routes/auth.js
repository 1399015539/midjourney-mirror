const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Mock admin credentials (in production, use proper auth)
const ADMIN_CREDENTIALS = {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'admin123'
};

// Login endpoint
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // Check credentials
        if (username === ADMIN_CREDENTIALS.username && password === ADMIN_CREDENTIALS.password) {
            // Generate JWT token
            const token = jwt.sign(
                { 
                    userId: 'admin',
                    username: username,
                    role: 'admin'
                },
                process.env.JWT_SECRET || 'your-super-secret-jwt-key',
                { expiresIn: '24h' }
            );

            logger.info(`Successful login for user: ${username}`);

            res.json({
                success: true,
                token,
                user: {
                    id: 'admin',
                    username: username,
                    role: 'admin'
                }
            });

        } else {
            logger.warn(`Failed login attempt for user: ${username}`);
            
            res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Verify token endpoint
router.post('/verify', (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'No token provided'
        });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');
        res.json({
            success: true,
            user: decoded
        });
    } catch (error) {
        res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
});

// Logout endpoint (client-side mainly, but can be used to blacklist tokens in production)
router.post('/logout', (req, res) => {
    res.json({
        success: true,
        message: 'Logged out successfully'
    });
});

module.exports = router;