const winston = require('winston');
const path = require('path');

// 确保日志目录存在
const logDir = path.join(__dirname, '../../logs');

// 创建Winston logger实例
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.errors({ stack: true }),
        winston.format.colorize({ all: true }),
        winston.format.printf(({ timestamp, level, message, stack }) => {
            if (stack) {
                return `${timestamp} [${level}]: ${message}\n${stack}`;
            }
            return `${timestamp} [${level}]: ${message}`;
        })
    ),
    transports: [
        // 控制台输出
        new winston.transports.Console({
            level: process.env.NODE_ENV === 'production' ? 'error' : 'debug',
            handleExceptions: true,
            handleRejections: true
        }),
        
        // 文件输出 - 所有日志
        new winston.transports.File({
            filename: path.join(logDir, 'app.log'),
            level: 'info',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            handleExceptions: true,
            handleRejections: true
        }),
        
        // 文件输出 - 仅错误
        new winston.transports.File({
            filename: path.join(logDir, 'error.log'),
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5,
            handleExceptions: true,
            handleRejections: true
        })
    ],
    exitOnError: false
});

// 创建日志目录（如果不存在）
const fs = require('fs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// 导出日志记录器
module.exports = logger;