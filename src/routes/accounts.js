const express = require('express');
const router = express.Router();
const AccountManager = require('../services/accountManager');
const logger = require('../utils/logger');
const authMiddleware = require('../middleware/auth');

const accountManager = new AccountManager();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Get all accounts
router.get('/', async (req, res) => {
    try {
        const accounts = accountManager.getAllAccounts();
        
        res.json({
            success: true,
            accounts
        });

    } catch (error) {
        logger.error('Error fetching accounts:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch accounts'
        });
    }
});

// Get specific account
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const account = accountManager.getAccountById(id);

        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'Account not found'
            });
        }

        // Remove sensitive data
        const { cookies, ...safeAccount } = account;
        
        res.json({
            success: true,
            account: safeAccount
        });

    } catch (error) {
        logger.error('Error fetching account:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch account'
        });
    }
});

// Add new account
router.post('/', async (req, res) => {
    try {
        const { name, email, cookies } = req.body;

        if (!name || !email || !cookies) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and cookies are required'
            });
        }

        // Check if account with email already exists
        const existingAccount = accountManager.getAccountByEmail(email);
        if (existingAccount) {
            return res.status(409).json({
                success: false,
                message: 'Account with this email already exists'
            });
        }

        // Add account
        const newAccount = accountManager.addAccount({
            name: name.trim(),
            email: email.trim(),
            cookies: cookies.trim()
        });

        // Remove sensitive data from response
        const { cookies: _, ...safeAccount } = newAccount;

        res.status(201).json({
            success: true,
            message: 'Account added successfully',
            account: safeAccount
        });

    } catch (error) {
        logger.error('Error adding account:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add account'
        });
    }
});

// Update account
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Remove sensitive fields that shouldn't be updated this way
        delete updates.id;
        
        const updatedAccount = accountManager.updateAccount(id, updates);

        // Remove sensitive data from response
        const { cookies, ...safeAccount } = updatedAccount;

        res.json({
            success: true,
            message: 'Account updated successfully',
            account: safeAccount
        });

    } catch (error) {
        logger.error('Error updating account:', error);
        
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: 'Account not found'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to update account'
        });
    }
});

// Delete account
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        accountManager.deleteAccount(id);

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        logger.error('Error deleting account:', error);
        
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: 'Account not found'
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to delete account'
        });
    }
});

// Validate account
router.post('/:id/validate', async (req, res) => {
    try {
        const { id } = req.params;
        
        const validation = accountManager.validateAccount(id);
        
        if (validation.valid) {
            res.json({
                success: true,
                valid: true,
                message: 'Account is valid and active'
            });
        } else {
            res.status(400).json({
                success: false,
                valid: false,
                message: validation.message
            });
        }

    } catch (error) {
        logger.error('Error validating account:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate account'
        });
    }
});

// Get account statistics
router.get('/:id/stats', async (req, res) => {
    try {
        const { id } = req.params;
        
        const account = accountManager.getAccountById(id);
        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'Account not found'
            });
        }

        // This would normally come from a database with usage stats
        const stats = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            lastActivity: account.lastLogin,
            status: account.status
        };

        res.json({
            success: true,
            stats
        });

    } catch (error) {
        logger.error('Error fetching account stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch account statistics'
        });
    }
});

module.exports = router;