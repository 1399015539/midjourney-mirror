const { v4: uuidv4 } = require('uuid');
const NodeCache = require('node-cache');
const logger = require('../utils/logger');

class SessionManager {
    constructor() {
        // 使用内存缓存存储会话，TTL设置为1小时
        this.sessions = new NodeCache({ 
            stdTTL: 3600,
            checkperiod: 60,
            deleteOnExpire: true
        });
        
        // 存储用户会话映射
        this.userSessions = new Map();
        
        // 监听会话过期事件
        this.sessions.on('expired', (sessionId, session) => {
            this.handleSessionExpired(sessionId, session);
        });
    }

    // 创建新会话
    createSession(userId, accountId, ipAddress, userAgent) {
        const sessionId = uuidv4();
        const expiresAt = new Date(Date.now() + 3600000); // 1小时后过期

        const session = {
            id: sessionId,
            userId,
            accountId,
            ipAddress,
            userAgent,
            createdAt: new Date(),
            lastActivity: new Date(),
            expiresAt,
            isActive: true
        };

        // 存储会话
        this.sessions.set(sessionId, session);
        
        // 更新用户会话映射
        if (!this.userSessions.has(userId)) {
            this.userSessions.set(userId, new Set());
        }
        this.userSessions.get(userId).add(sessionId);

        logger.info(`Session created: ${sessionId} for user: ${userId}, account: ${accountId}`);
        return session;
    }

    // 获取会话
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session && session.isActive) {
            // 更新最后活动时间
            session.lastActivity = new Date();
            this.sessions.set(sessionId, session);
            return session;
        }
        return null;
    }

    // 验证会话
    validateSession(sessionId, userId = null) {
        const session = this.getSession(sessionId);
        
        if (!session) {
            return { valid: false, message: 'Session not found or expired' };
        }

        if (!session.isActive) {
            return { valid: false, message: 'Session is inactive' };
        }

        if (userId && session.userId !== userId) {
            return { valid: false, message: 'Session user mismatch' };
        }

        if (new Date() > new Date(session.expiresAt)) {
            this.destroySession(sessionId);
            return { valid: false, message: 'Session expired' };
        }

        return { valid: true, session };
    }

    // 续期会话
    renewSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session || !session.isActive) {
            return null;
        }

        // 延长会话时间
        const newExpiresAt = new Date(Date.now() + 3600000);
        session.expiresAt = newExpiresAt;
        session.lastActivity = new Date();
        
        this.sessions.set(sessionId, session, 3600); // 重新设置TTL
        
        logger.info(`Session renewed: ${sessionId}`);
        return session;
    }

    // 更新会话活动时间
    updateActivity(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session && session.isActive) {
            session.lastActivity = new Date();
            this.sessions.set(sessionId, session);
        }
    }

    // 获取用户的所有会话
    getUserSessions(userId) {
        const sessionIds = this.userSessions.get(userId);
        if (!sessionIds) {
            return [];
        }

        const sessions = [];
        for (const sessionId of sessionIds) {
            const session = this.sessions.get(sessionId);
            if (session && session.isActive) {
                sessions.push(session);
            }
        }

        return sessions;
    }

    // 获取账号的活跃会话
    getAccountSessions(accountId) {
        const sessions = [];
        const allSessions = this.sessions.keys();

        for (const sessionId of allSessions) {
            const session = this.sessions.get(sessionId);
            if (session && session.accountId === accountId && session.isActive) {
                sessions.push(session);
            }
        }

        return sessions;
    }

    // 检查账号是否有活跃会话
    isAccountActive(accountId) {
        const sessions = this.getAccountSessions(accountId);
        return sessions.length > 0;
    }

    // 销毁指定会话
    destroySession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            // 从用户会话映射中移除
            if (this.userSessions.has(session.userId)) {
                this.userSessions.get(session.userId).delete(sessionId);
                
                // 如果用户没有其他会话，清理映射
                if (this.userSessions.get(session.userId).size === 0) {
                    this.userSessions.delete(session.userId);
                }
            }

            // 删除会话
            this.sessions.del(sessionId);
            logger.info(`Session destroyed: ${sessionId}`);
            
            return true;
        }
        
        return false;
    }

    // 销毁用户的所有会话
    destroyUserSessions(userId) {
        const sessionIds = this.userSessions.get(userId);
        if (!sessionIds) {
            return 0;
        }

        let destroyedCount = 0;
        for (const sessionId of Array.from(sessionIds)) {
            if (this.destroySession(sessionId)) {
                destroyedCount++;
            }
        }

        logger.info(`Destroyed ${destroyedCount} sessions for user: ${userId}`);
        return destroyedCount;
    }

    // 销毁账号的所有会话
    destroyAccountSessions(accountId) {
        const sessions = this.getAccountSessions(accountId);
        let destroyedCount = 0;

        for (const session of sessions) {
            if (this.destroySession(session.id)) {
                destroyedCount++;
            }
        }

        logger.info(`Destroyed ${destroyedCount} sessions for account: ${accountId}`);
        return destroyedCount;
    }

    // 清理过期会话
    cleanupExpiredSessions() {
        const now = new Date();
        const allSessions = this.sessions.keys();
        let cleanedCount = 0;

        for (const sessionId of allSessions) {
            const session = this.sessions.get(sessionId);
            if (session && new Date(session.expiresAt) <= now) {
                this.destroySession(sessionId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            logger.info(`Cleaned up ${cleanedCount} expired sessions`);
        }
        
        return cleanedCount;
    }

    // 处理会话过期事件
    handleSessionExpired(sessionId, session) {
        if (session && this.userSessions.has(session.userId)) {
            this.userSessions.get(session.userId).delete(sessionId);
            
            if (this.userSessions.get(session.userId).size === 0) {
                this.userSessions.delete(session.userId);
            }
        }
        
        logger.info(`Session expired and cleaned up: ${sessionId}`);
    }

    // 获取会话统计信息
    getSessionStats() {
        const allSessions = this.sessions.keys();
        let activeCount = 0;
        let totalCount = allSessions.length;
        
        const accountCounts = new Map();
        const userCounts = new Map();

        for (const sessionId of allSessions) {
            const session = this.sessions.get(sessionId);
            if (session) {
                if (session.isActive) {
                    activeCount++;
                }
                
                // 统计每个账号的会话数
                const accountId = session.accountId;
                accountCounts.set(accountId, (accountCounts.get(accountId) || 0) + 1);
                
                // 统计每个用户的会话数
                const userId = session.userId;
                userCounts.set(userId, (userCounts.get(userId) || 0) + 1);
            }
        }

        return {
            total: totalCount,
            active: activeCount,
            inactive: totalCount - activeCount,
            uniqueUsers: userCounts.size,
            uniqueAccounts: accountCounts.size,
            accountDistribution: Object.fromEntries(accountCounts),
            userDistribution: Object.fromEntries(userCounts)
        };
    }

    // 定期清理任务
    startCleanupTask() {
        // 每5分钟清理一次过期会话
        setInterval(() => {
            this.cleanupExpiredSessions();
        }, 300000);
        
        logger.info('Session cleanup task started');
    }
}

module.exports = SessionManager;