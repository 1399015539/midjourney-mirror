const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

class AccountManager {
    constructor() {
        // Mock数据，包含你提供的Cookie
        this.accounts = new Map([
            ['account1', {
                id: 'account1',
                name: 'xiaohui23231',
                email: 'america15fisherlwl@hotmail.com',
                cookies: '_cfuvid=TXSi.AibDZeW1yrjyBd855oqOdAWP1wdtFNfUpToA6k-1753147478011-0.0.1.1-604800000;__cf_bm=lJEPF4F9_o9gBVsPdkyQS_lJnkW5qGxFBX.AkDrjmqs-1753147478-1.0.1.1-bHfD4AYbF9s4g7IPOYZS81oX9Vo2jcNGbdXk1gVn_4nG8_78zt.Uk1wHN2CalnybO07vOORQwWEizznyLQ6eEyV1RatA_b7zNSgGCPKimVs;__Host-Midjourney.AuthUserTokenV3_i=eyJhbGciOiJSUzI1NiIsImtpZCI6ImE4ZGY2MmQzYTBhNDRlM2RmY2RjYWZjNmRhMTM4Mzc3NDU5ZjliMDEiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoieGlhb2h1aTIzMjMxIiwibWlkam91cm5leV9pZCI6ImVhMThhZWNkLTc3YzAtNGU3YS1hZjkxLTRhMDM4ZGQxMDA5MiIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9hdXRoam91cm5leSIsImF1ZCI6ImF1dGhqb3VybmV5IiwiYXV0aF90aW1lIjoxNzUzMTQ3NDc0LCJ1c2VyX2lkIjoia1lrbGtOUDNiRFRDR0FNUE1RUHJBVzdzY001MiIsInN1YiI6ImtZa2xrTlAzYkRUQ0dBTVBNUVByQVc3c2NNNTIiLCJpYXQiOjE3NTMxNDc0NzQsImV4cCI6MTc1MzE1MTA3NCwiZW1haWwiOiJhbWVyaWNhMTVmaXNoZXJsd2xAaG90bWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwiZmlyZWJhc2UiOnsiaWRlbnRpdGllcyI6eyJkaXNjb3JkLmNvbSI6WyIxMjUwNDEyOTk3MzYxNDA2MDY4Il0sImVtYWlsIjpbImFtZXJpY2ExNWZpc2hlcmx3bEBob3RtYWlsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6ImRpc2NvcmQuY29tIn19.nhYkVlMaf2m1J8ws7vcnvRdAkZlOdGN9VRIwg7tA1Fa367GcBYSHFL3uvtWH6BeX27xdcszWrpX6R9Ar0HXNcADRWQXNFFUF6EDhAfQmd6roaR_dN50pLmIk_2_90a-j9M5Ku7rcqtL3zbl9n7GpU9lRN3mKYwumEuBO8uzAsc2oWLLtGVL97O4_ijs1-38BjSeLgrxst8zlKIwudYllsuf4tbA6Xax6zzrR3EP3jUZN4GUY2qteTUtFCU9Lv1-Rjeo6RUTFx_JTyZdaZU0VM3BnfPrsdR_bGuLB5HBicfMue_A8sgjFpzW0rOp68drAFoKRRMKc4aEyAGUz7txFfQ;__Host-Midjourney.AuthUserTokenV3_r=AMf-vBzwMK590hFgTVAA8MJG-wy6qEpu_yiuA9fpsJIF1fZHkmtmZ7f0XJeTefhV_5YjUQpC9sxEc1kcpDqMLfJnetp1FCJVocymrv68gXY_9ETbeGBmmuAw9St9vDGE4biFip3WmJPLmPhmo7oB74wv0GS3_Ia1hfK5hY0JipznWpQnW64469PG57nJQXMoNn7yQ3qdcm0ihKGhFjZ5naLwvXG4kIb-ldm03Jk36_l61wz8xUtmMW2uuXAu0IwZDfdfqRKUcXoZlGmkvd4tMw1KZG7Em-2JFQ;__stripe_mid=ab3eaba4-f427-4675-9047-7329532ba4067810e8',
                userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                status: 'active',
                lastLogin: new Date().toISOString(),
                createdAt: new Date().toISOString()
            }],
            ['account2', {
                id: 'account2',
                name: 'TestUser2',
                email: 'test2@example.com',
                cookies: '_cfuvid=demo2;__cf_bm=demo2;__Host-Midjourney.AuthUserTokenV3_i=demo2;__Host-Midjourney.AuthUserTokenV3_r=demo2',
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                status: 'inactive',
                lastLogin: new Date(Date.now() - 86400000).toISOString(),
                createdAt: new Date().toISOString()
            }],
            ['account3', {
                id: 'account3',
                name: 'DemoAccount3',
                email: 'demo3@example.com',
                cookies: '_cfuvid=demo3;__cf_bm=demo3;__Host-Midjourney.AuthUserTokenV3_i=demo3;__Host-Midjourney.AuthUserTokenV3_r=demo3',
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                status: 'active',
                lastLogin: new Date(Date.now() - 3600000).toISOString(),
                createdAt: new Date().toISOString()
            }]
        ]);
        
        this.sessions = new Map();
    }

    // 获取所有账号列表
    getAllAccounts() {
        return Array.from(this.accounts.values()).map(account => ({
            id: account.id,
            name: account.name,
            email: account.email,
            status: account.status,
            lastLogin: account.lastLogin
        }));
    }

    // 根据ID获取账号
    getAccountById(accountId) {
        return this.accounts.get(accountId);
    }

    // 根据邮箱获取账号
    getAccountByEmail(email) {
        for (const account of this.accounts.values()) {
            if (account.email === email) {
                return account;
            }
        }
        return null;
    }

    // 添加新账号
    addAccount(accountData) {
        const accountId = accountData.id || uuidv4();
        const account = {
            id: accountId,
            name: accountData.name,
            email: accountData.email,
            cookies: accountData.cookies,
            userAgent: accountData.userAgent || this.getRandomUserAgent(),
            status: accountData.status || 'active',
            lastLogin: accountData.lastLogin || new Date().toISOString(),
            createdAt: new Date().toISOString()
        };

        this.accounts.set(accountId, account);
        logger.info(`Account added: ${accountId} (${account.email})`);
        return account;
    }

    // 更新账号
    updateAccount(accountId, updates) {
        const account = this.accounts.get(accountId);
        if (!account) {
            throw new Error(`Account not found: ${accountId}`);
        }

        const updatedAccount = {
            ...account,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        this.accounts.set(accountId, updatedAccount);
        logger.info(`Account updated: ${accountId}`);
        return updatedAccount;
    }

    // 删除账号
    deleteAccount(accountId) {
        if (!this.accounts.has(accountId)) {
            throw new Error(`Account not found: ${accountId}`);
        }

        this.accounts.delete(accountId);
        // 清理相关会话
        this.clearAccountSessions(accountId);
        logger.info(`Account deleted: ${accountId}`);
    }

    // 验证账号状态
    validateAccount(accountId) {
        const account = this.getAccountById(accountId);
        if (!account) {
            return { valid: false, message: 'Account not found' };
        }

        if (account.status !== 'active') {
            return { valid: false, message: 'Account is not active' };
        }

        // 可以在这里添加Cookie有效性检查
        if (!account.cookies) {
            return { valid: false, message: 'Account cookies missing' };
        }

        return { valid: true, account };
    }

    // 获取随机User-Agent
    getRandomUserAgent() {
        const userAgents = [
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];
        return userAgents[Math.floor(Math.random() * userAgents.length)];
    }

    // 清理账号相关会话
    clearAccountSessions(accountId) {
        const sessionsToDelete = [];
        for (const [sessionId, session] of this.sessions) {
            if (session.accountId === accountId) {
                sessionsToDelete.push(sessionId);
            }
        }

        sessionsToDelete.forEach(sessionId => {
            this.sessions.delete(sessionId);
        });

        logger.info(`Cleared ${sessionsToDelete.length} sessions for account: ${accountId}`);
    }
}

module.exports = AccountManager;