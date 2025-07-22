// Account Management JavaScript
class AccountManager {
    constructor() {
        this.auth = new AuthManager();
        this.accounts = [];
        this.selectedAccount = JSON.parse(localStorage.getItem('selected_account') || 'null');
    }

    // Initialize account selection page
    async init() {
        // Check authentication
        if (!this.auth.isAuthenticated()) {
            window.location.href = '/login';
            return;
        }

        // Load accounts
        await this.loadAccounts();
        this.setupEventListeners();
    }

    // Load accounts from server
    async loadAccounts() {
        try {
            const response = await this.auth.apiRequest('/api/accounts');
            
            if (response && response.ok) {
                const data = await response.json();
                this.accounts = data.accounts || [];
                this.renderAccounts();
            } else {
                this.showNotification('Failed to load accounts', 'error');
            }
        } catch (error) {
            console.error('Error loading accounts:', error);
            this.showNotification('Network error while loading accounts', 'error');
        }
    }

    // Render accounts grid
    renderAccounts() {
        const grid = document.getElementById('accountsGrid');
        if (!grid) return;

        if (this.accounts.length === 0) {
            grid.innerHTML = `
                <div class="no-accounts">
                    <h3>No accounts available</h3>
                    <p>Add your first Midjourney account to get started</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = this.accounts.map(account => `
            <div class="account-card" onclick="selectAccount('${account.id}')">
                <div class="account-header">
                    <div class="account-info">
                        <h3>${this.escapeHtml(account.name)}</h3>
                        <p>${this.escapeHtml(account.email)}</p>
                    </div>
                    <div class="account-status ${account.status}">
                        ${account.status}
                    </div>
                </div>
                <div class="account-meta">
                    <span>Last login: ${this.formatDate(account.lastLogin)}</span>
                    <div class="account-actions">
                        <button class="action-btn" onclick="event.stopPropagation(); editAccount('${account.id}')">
                            Edit
                        </button>
                        <button class="action-btn danger" onclick="event.stopPropagation(); deleteAccount('${account.id}')">
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Setup event listeners
    setupEventListeners() {
        const addAccountForm = document.getElementById('addAccountForm');
        if (addAccountForm) {
            addAccountForm.addEventListener('submit', this.handleAddAccount.bind(this));
        }

        // Close modal on outside click
        const modal = document.getElementById('addAccountModal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideAddAccountModal();
                }
            });
        }
    }

    // Select account and navigate to mirror
    async selectAccount(accountId) {
        // 防止重复选择
        if (this.isSelecting) {
            console.log('Account selection already in progress');
            return;
        }
        
        this.isSelecting = true;
        
        try {
            const account = this.accounts.find(acc => acc.id === accountId);
            if (!account) {
                this.showNotification('Account not found', 'error');
                return;
            }

            if (account.status !== 'active') {
                this.showNotification('Account is not active', 'error');
                return;
            }

            this.showNotification('Validating account...', 'info');

            // Validate account with server
            const response = await this.auth.apiRequest(`/api/accounts/${accountId}/validate`, {
                method: 'POST'
            });

            if (response && response.ok) {
                const data = await response.json();
                if (data.valid) {
                    // Store selected account
                    localStorage.setItem('selected_account', JSON.stringify(account));
                    
                    this.showNotification('Account selected. Redirecting...', 'success');
                    
                    // 直接跳转，不等待
                    window.location.href = '/explore';
                } else {
                    this.showNotification(data.message || 'Account validation failed', 'error');
                }
            } else {
                const errorData = await response.json().catch(() => ({}));
                this.showNotification(errorData.message || 'Failed to validate account', 'error');
            }

        } catch (error) {
            console.error('Error selecting account:', error);
            this.showNotification('Error selecting account: ' + error.message, 'error');
        } finally {
            this.isSelecting = false;
        }
    }

    // Handle add account form
    async handleAddAccount(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const accountData = {
            name: formData.get('name'),
            email: formData.get('email'),
            cookies: formData.get('cookies')
        };

        try {
            const response = await this.auth.apiRequest('/api/accounts', {
                method: 'POST',
                body: JSON.stringify(accountData)
            });

            if (response && response.ok) {
                const data = await response.json();
                this.showNotification('Account added successfully', 'success');
                this.hideAddAccountModal();
                e.target.reset();
                
                // Reload accounts
                await this.loadAccounts();
            } else {
                const data = await response.json();
                this.showNotification(data.message || 'Failed to add account', 'error');
            }

        } catch (error) {
            console.error('Error adding account:', error);
            this.showNotification('Error adding account', 'error');
        }
    }

    // Edit account
    async editAccount(accountId) {
        // For now, just show that it's not implemented
        this.showNotification('Edit functionality coming soon', 'info');
    }

    // Delete account
    async deleteAccount(accountId) {
        if (!confirm('Are you sure you want to delete this account?')) {
            return;
        }

        try {
            const response = await this.auth.apiRequest(`/api/accounts/${accountId}`, {
                method: 'DELETE'
            });

            if (response && response.ok) {
                this.showNotification('Account deleted successfully', 'success');
                
                // Remove from local array
                this.accounts = this.accounts.filter(acc => acc.id !== accountId);
                this.renderAccounts();
                
                // Clear selected account if it was deleted
                if (this.selectedAccount && this.selectedAccount.id === accountId) {
                    localStorage.removeItem('selected_account');
                }
            } else {
                this.showNotification('Failed to delete account', 'error');
            }

        } catch (error) {
            console.error('Error deleting account:', error);
            this.showNotification('Error deleting account', 'error');
        }
    }

    // Show add account modal
    showAddAccountModal() {
        const modal = document.getElementById('addAccountModal');
        if (modal) {
            modal.style.display = 'flex';
            
            // Focus on first input
            const firstInput = modal.querySelector('input');
            if (firstInput) {
                setTimeout(() => firstInput.focus(), 100);
            }
        }
    }

    // Hide add account modal
    hideAddAccountModal() {
        const modal = document.getElementById('addAccountModal');
        if (modal) {
            modal.style.display = 'none';
            
            // Reset form
            const form = modal.querySelector('form');
            if (form) {
                form.reset();
            }
        }
    }

    // Utility methods
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatDate(dateString) {
        if (!dateString) return 'Never';
        
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
        } catch (error) {
            return 'Invalid date';
        }
    }

    // Show notification
    showNotification(message, type = 'info') {
        this.auth.showNotification(message, type);
    }
}

// Global functions for HTML onclick events
function selectAccount(accountId) {
    window.accountManager.selectAccount(accountId);
}

function editAccount(accountId) {
    window.accountManager.editAccount(accountId);
}

function deleteAccount(accountId) {
    window.accountManager.deleteAccount(accountId);
}

function showAddAccountModal() {
    window.accountManager.showAddAccountModal();
}

function hideAddAccountModal() {
    window.accountManager.hideAddAccountModal();
}

function logout() {
    const auth = new AuthManager();
    auth.logout();
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.accountManager = new AccountManager();
    window.accountManager.init();
});