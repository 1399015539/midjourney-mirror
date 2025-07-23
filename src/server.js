require('dotenv').config();
const express = require('express');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { RateLimiterMemory } = require('rate-limiter-flexible');

const logger = require('./utils/logger');
const SessionManager = require('./services/sessionManager');

// Import routes
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const mirrorRoutes = require('./routes/mirror');

const app = express();
const port = process.env.PORT || 3000;

// Initialize services
const sessionManager = new SessionManager();
sessionManager.startCleanupTask();

// Rate limiting
const rateLimiter = new RateLimiterMemory({
    keyPrefix: 'login_fail_ip',
    points: 5, // Number of attempts
    duration: 15 * 60, // Per 15 minutes
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

app.use(compression());
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Mirror-Account-ID', 'X-Mirror-Session-ID']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Request logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url} - ${req.ip}`);
    next();
});

// Rate limiting middleware for login attempts
app.use('/api/auth/login', async (req, res, next) => {
    try {
        await rateLimiter.consume(req.ip);
        next();
    } catch (rejRes) {
        const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
        res.set('Retry-After', String(secs));
        res.status(429).json({
            success: false,
            message: `Too many login attempts. Try again in ${secs} seconds.`
        });
    }
});

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/mirror', mirrorRoutes);

// Additional proxy routes that don't require authentication
app.use('/api/proxy', (req, res, next) => {
    // These routes handle the rewritten URLs from the mirror content
    next();
}, mirrorRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: require('../package.json').version,
        environment: process.env.NODE_ENV
    });
});

// Handle SPA routes with clean URLs
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/account', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/account-select.html'));
});

app.get('/explore', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/mirror.html'));
});

app.get('/app*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/mirror.html'));
});

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('*', (req, res) => {
    // If it's an API route that doesn't exist, return 404
    if (req.url.startsWith('/api/')) {
        return res.status(404).json({
            success: false,
            message: 'API endpoint not found'
        });
    }
    
    // For other routes, check if specific HTML file exists
    const requestedFile = req.url === '/' ? '/login.html' : req.url;
    const filePath = path.join(__dirname, '../public', requestedFile);
    
    // If the file exists, serve it, otherwise redirect to login
    require('fs').access(filePath, require('fs').constants.F_OK, (err) => {
        if (err) {
            res.redirect('/login');
        } else {
            res.sendFile(filePath);
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Unhandled error:', error);
    
    res.status(error.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : error.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: error.stack })
    });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    
    // Close server
    server.close(() => {
        logger.info('HTTP server closed.');
        
        // Clean up resources
        // Add cleanup for browser instances, etc.
        process.exit(0);
    });
});

// Start server
const server = app.listen(port, () => {
    logger.info(`Midjourney Mirror server started on port ${port}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    
    if (process.env.NODE_ENV !== 'production') {
        logger.info(`Open http://localhost:${port} to access the application`);
    }
});

module.exports = app;