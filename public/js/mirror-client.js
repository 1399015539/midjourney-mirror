// Mirror Client JavaScript
class MirrorClient {
    constructor() {
        this.auth = new AuthManager();
        this.selectedAccount = JSON.parse(localStorage.getItem('selected_account') || 'null');
        this.isLoading = false;
        this.retryCount = 0;
        this.maxRetries = 3;
    }

    // Initialize mirror page
    async init() {
        // Check authentication
        if (!this.auth.isAuthenticated()) {
            window.location.href = '/login';
            return;
        }

        // Check if account is selected
        if (!this.selectedAccount) {
            window.location.href = '/account';
            return;
        }

        // Update UI with account info
        this.updateAccountInfo();

        // Initialize mirror
        await this.initializeMirror();
    }

    // Update account information in UI
    updateAccountInfo() {
        const accountNameEl = document.getElementById('currentAccountName');
        if (accountNameEl && this.selectedAccount) {
            accountNameEl.textContent = this.selectedAccount.name;
        }
    }

    // Initialize mirror functionality
    async initializeMirror() {
        if (this.isLoading) return;
        
        this.isLoading = true;
        this.showLoading();

        try {
            // First, create a browser session for this account
            const sessionResponse = await this.auth.apiRequest('/api/mirror/session', {
                method: 'POST',
                body: JSON.stringify({
                    accountId: this.selectedAccount.id
                })
            });

            if (!sessionResponse || !sessionResponse.ok) {
                throw new Error('Failed to create mirror session');
            }

            const sessionData = await sessionResponse.json();
            this.sessionId = sessionData.sessionId;

            // Now fetch the initial page content
            await this.loadMirrorContent();

        } catch (error) {
            console.error('Error initializing mirror:', error);
            this.showError('Failed to initialize mirror: ' + error.message);
        } finally {
            this.isLoading = false;
        }
    }

    // Load mirror content
    async loadMirrorContent() {
        try {
            const response = await this.auth.apiRequest(`/api/mirror/content?accountId=${this.selectedAccount.id}&sessionId=${this.sessionId}`);
            
            if (!response || !response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || 'Failed to load mirror content');
            }

            const data = await response.json();
            
            if (data.content) {
                // Process the content to rewrite URLs
                const processedContent = this.processContent(data.content);
                
                // Load content into iframe
                this.loadContentIntoFrame(processedContent);
                
                this.showMirror();
                this.retryCount = 0; // Reset retry count on success
                
            } else {
                throw new Error('No content received from server');
            }

        } catch (error) {
            console.error('Error loading mirror content:', error);
            this.handleLoadError(error);
        }
    }

    // Process content to rewrite URLs for proxying
    processContent(htmlContent) {
        // Replace Midjourney URLs with our proxy URLs
        let processedContent = htmlContent;
        
        // Replace API URLs
        processedContent = processedContent.replace(
            /https:\/\/(www\.)?midjourney\.com\/api\//g,
            `/api/mirror/mj-api/`
        );
        
        // Replace static resource URLs (including external resources)
        processedContent = processedContent.replace(
            /https:\/\/fonts\.googleapis\.com/g,
            '/api/mirror/static/https://fonts.googleapis.com'
        );
        
        processedContent = processedContent.replace(
            /https:\/\/challenges\.cloudflare\.com/g,
            '/api/mirror/static/https://challenges.cloudflare.com'
        );
        
        processedContent = processedContent.replace(
            /https:\/\/www\.googletagmanager\.com/g,
            '/api/mirror/static/https://www.googletagmanager.com'
        );
        
        // Replace CDN URLs
        processedContent = processedContent.replace(
            /https:\/\/cdn\.midjourney\.com\//g,
            '/api/mirror/static/https://cdn.midjourney.com/'
        );
        
        // Inject our proxy script
        const proxyScript = `
            <script>
                // Override fetch to use our proxy
                const originalFetch = window.fetch;
                window.fetch = function(url, options = {}) {
                    if (typeof url === 'string') {
                        if (url.startsWith('/api/') && !url.startsWith('/api/mirror/')) {
                            url = '/api/mirror/mj-api' + url;
                        } else if (url.startsWith('https://www.midjourney.com/api/')) {
                            url = url.replace('https://www.midjourney.com/api/', '/api/mirror/mj-api/');
                        } else if (url.startsWith('https://midjourney.com/api/')) {
                            url = url.replace('https://midjourney.com/api/', '/api/mirror/mj-api/');
                        }
                        
                        // Add account session header
                        options.headers = options.headers || {};
                        options.headers['X-Mirror-Account-ID'] = '${this.selectedAccount.id}';
                        options.headers['X-Mirror-Session-ID'] = '${this.sessionId}';
                    }
                    
                    return originalFetch(url, options);
                };

                // Override XMLHttpRequest
                const originalXHR = window.XMLHttpRequest;
                window.XMLHttpRequest = function() {
                    const xhr = new originalXHR();
                    const originalOpen = xhr.open;
                    
                    xhr.open = function(method, url, ...args) {
                        if (typeof url === 'string') {
                            if (url.startsWith('/api/') && !url.startsWith('/api/mirror/')) {
                                url = '/api/mirror/mj-api' + url;
                            } else if (url.startsWith('https://www.midjourney.com/api/')) {
                                url = url.replace('https://www.midjourney.com/api/', '/api/mirror/mj-api/');
                            } else if (url.startsWith('https://midjourney.com/api/')) {
                                url = url.replace('https://midjourney.com/api/', '/api/mirror/mj-api/');
                            }
                        }
                        
                        originalOpen.call(this, method, url, ...args);
                        
                        // Set account headers
                        xhr.setRequestHeader('X-Mirror-Account-ID', '${this.selectedAccount.id}');
                        xhr.setRequestHeader('X-Mirror-Session-ID', '${this.sessionId}');
                    };
                    
                    return xhr;
                };

                // Notify parent window that content is loaded
                window.addEventListener('load', () => {
                    parent.postMessage({ type: 'mirror-loaded' }, '*');
                });
                
                console.log('FlareSolverr mirror proxy initialized for account: ${this.selectedAccount.id}');
            </script>
        `;
        
        // Inject the script before closing head tag
        processedContent = processedContent.replace('</head>', proxyScript + '</head>');
        
        return processedContent;
    }

    // Load content into iframe
    loadContentIntoFrame(content) {
        const iframe = document.getElementById('mirrorFrame');
        if (iframe) {
            try {
                // 使用 srcdoc 属性直接加载 HTML 内容
                // 这样可以保持相对路径引用，同时避免跨域问题
                iframe.srcdoc = content;
                
                // 设置 sandbox 属性允许必要的权限
                // allow-same-origin 是必需的，因为静态资源需要从同一源加载
                // 但我们通过内容安全策略和其他措施来确保安全性
                iframe.setAttribute('sandbox', 'allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads');
                
                // 处理加载完成事件
                iframe.onload = () => {
                    console.log('Iframe content loaded successfully');
                    
                    // 监听iframe内的消息
                    try {
                        const iframeWindow = iframe.contentWindow;
                        if (iframeWindow) {
                            // 监听资源加载错误
                            iframeWindow.addEventListener('error', (event) => {
                                console.log('Resource loading error in iframe:', event.target?.src || event.target?.href || 'unknown');
                            }, true);
                            
                            // 监听未处理的异常
                            iframeWindow.addEventListener('unhandledrejection', (event) => {
                                console.log('Unhandled promise rejection in iframe:', event.reason);
                            });
                        }
                    } catch (e) {
                        // 这是预期的，因为沙盒限制了某些访问
                        console.log('Limited iframe access (expected for sandboxed iframe)');
                    }
                };
                
                // Handle iframe errors
                iframe.onerror = (error) => {
                    console.error('Iframe loading error:', error);
                    this.showError('Failed to load mirror content in frame');
                };
                
            } catch (error) {
                console.error('Error setting iframe content:', error);
                this.showError('Failed to set mirror content: ' + error.message);
            }
        }
    }

    // Handle load errors with retry logic
    handleLoadError(error) {
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            this.showNotification(`Loading failed, retrying... (${this.retryCount}/${this.maxRetries})`, 'warning');
            
            setTimeout(() => {
                this.loadMirrorContent();
            }, 2000 * this.retryCount); // Exponential backoff
        } else {
            this.showError(`Failed to load mirror after ${this.maxRetries} attempts: ${error.message}`);
        }
    }

    // Show loading state
    showLoading() {
        document.getElementById('loadingOverlay').style.display = 'flex';
        document.getElementById('mirrorContainer').style.display = 'none';
        document.getElementById('errorContainer').style.display = 'none';
    }

    // Show mirror content
    showMirror() {
        document.getElementById('loadingOverlay').style.display = 'none';
        document.getElementById('mirrorContainer').style.display = 'block';
        document.getElementById('errorContainer').style.display = 'none';
    }

    // Show error state
    showError(message) {
        document.getElementById('loadingOverlay').style.display = 'none';
        document.getElementById('mirrorContainer').style.display = 'none';
        document.getElementById('errorContainer').style.display = 'flex';
        
        const errorMessageEl = document.getElementById('errorMessage');
        if (errorMessageEl) {
            errorMessageEl.textContent = message;
        }
    }

    // Refresh mirror
    async refreshMirror() {
        this.retryCount = 0;
        await this.initializeMirror();
    }

    // Switch account
    switchAccount() {
        localStorage.removeItem('selected_account');
        window.location.href = '/account';
    }

    // Show notification
    showNotification(message, type = 'info') {
        this.auth.showNotification(message, type);
    }
}

// Global functions for HTML onclick events
function refreshMirror() {
    window.mirrorClient.refreshMirror();
}

function switchAccount() {
    window.mirrorClient.switchAccount();
}

function logout() {
    const auth = new AuthManager();
    auth.logout();
}

function initializeMirror() {
    window.mirrorClient.initializeMirror();
}

// Handle messages from iframe
window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'mirror-loaded') {
        console.log('Mirror content loaded successfully');
        window.mirrorClient.showNotification('Mirror loaded successfully', 'success');
    }
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.mirrorClient = new MirrorClient();
    window.mirrorClient.init();
});