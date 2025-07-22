// Authentication JavaScript
class AuthManager {
    constructor() {
        this.token = localStorage.getItem('auth_token');
        this.user = JSON.parse(localStorage.getItem('user') || 'null');
    }

    // Initialize login form (only for login page)
    init() {
        const loginForm = document.getElementById('loginForm');
        if (loginForm) {
            loginForm.addEventListener('submit', this.handleLogin.bind(this));
            
            // Check if already authenticated (only on login page)
            if (this.isAuthenticated()) {
                window.location.href = '/account';
            }
        }
    }

    // Handle login form submission
    async handleLogin(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const credentials = {
            username: formData.get('username'),
            password: formData.get('password')
        };

        const loginBtn = document.getElementById('loginBtn');
        const btnText = loginBtn.querySelector('.btn-text');
        const btnLoading = loginBtn.querySelector('.btn-loading');

        try {
            // Show loading state
            this.setLoadingState(loginBtn, btnText, btnLoading, true);

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(credentials)
            });

            const data = await response.json();

            if (response.ok) {
                // Store authentication data
                this.token = data.token;
                this.user = data.user;
                localStorage.setItem('auth_token', this.token);
                localStorage.setItem('user', JSON.stringify(this.user));

                this.showNotification('Login successful! Redirecting...', 'success');
                
                // Redirect to account selection
                setTimeout(() => {
                    window.location.href = '/account';
                }, 1000);

            } else {
                this.showNotification(data.message || 'Login failed', 'error');
            }

        } catch (error) {
            console.error('Login error:', error);
            this.showNotification('Network error. Please try again.', 'error');
        } finally {
            this.setLoadingState(loginBtn, btnText, btnLoading, false);
        }
    }

    // Set button loading state
    setLoadingState(btn, textEl, loadingEl, isLoading) {
        if (isLoading) {
            btn.disabled = true;
            textEl.style.display = 'none';
            loadingEl.style.display = 'inline';
        } else {
            btn.disabled = false;
            textEl.style.display = 'inline';
            loadingEl.style.display = 'none';
        }
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.token && this.user;
    }

    // Get authentication token
    getToken() {
        return this.token;
    }

    // Get user data
    getUser() {
        return this.user;
    }

    // Logout
    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        localStorage.removeItem('selected_account');
        window.location.href = '/login';
    }

    // Make authenticated API request
    async apiRequest(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (response.status === 401) {
            // Token expired or invalid
            this.logout();
            return;
        }

        return response;
    }

    // Show notification
    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        const messageEl = notification.querySelector('.notification-message');
        const closeBtn = notification.querySelector('.notification-close');

        messageEl.textContent = message;
        notification.className = `notification ${type}`;
        notification.style.display = 'block';

        // Auto hide after 5 seconds
        setTimeout(() => {
            notification.style.display = 'none';
        }, 5000);

        // Manual close
        closeBtn.onclick = () => {
            notification.style.display = 'none';
        };
    }
}

// Global functions for HTML onclick events
function logout() {
    const auth = new AuthManager();
    auth.logout();
}

// Make AuthManager available globally
window.AuthManager = AuthManager;