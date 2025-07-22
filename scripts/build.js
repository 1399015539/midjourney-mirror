const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

async function buildProject() {
    console.log('🚀 Starting build process...');
    
    const buildDir = path.join(__dirname, '../build');
    const distDir = path.join(__dirname, '../dist');
    
    // Create build directory
    if (fs.existsSync(buildDir)) {
        fs.rmSync(buildDir, { recursive: true });
    }
    fs.mkdirSync(buildDir, { recursive: true });
    
    // Create dist directory
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
    }
    
    console.log('📁 Copying source files...');
    
    // Copy source files
    copyDirectory(path.join(__dirname, '../src'), path.join(buildDir, 'src'));
    copyDirectory(path.join(__dirname, '../public'), path.join(buildDir, 'public'));
    
    // Copy configuration files
    const configFiles = [
        'package.json',
        '.env.example',
        'CLAUDE.md'
    ];
    
    configFiles.forEach(file => {
        const srcPath = path.join(__dirname, '..', file);
        const destPath = path.join(buildDir, file);
        
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
            console.log(`✅ Copied ${file}`);
        }
    });
    
    // Create production package.json (remove dev dependencies)
    const packageJson = JSON.parse(fs.readFileSync(path.join(buildDir, 'package.json')));
    delete packageJson.devDependencies;
    packageJson.scripts = {
        start: 'node src/server.js',
        postinstall: 'echo "Installation complete. Copy .env.example to .env and configure your settings."'
    };
    
    fs.writeFileSync(
        path.join(buildDir, 'package.json'), 
        JSON.stringify(packageJson, null, 2)
    );
    
    // Create startup scripts
    createStartupScripts(buildDir);
    
    // Create README for deployment
    createDeploymentReadme(buildDir);
    
    console.log('✨ Build completed successfully!');
    return buildDir;
}

function copyDirectory(src, dest) {
    if (!fs.existsSync(src)) return;
    
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    entries.forEach(entry => {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyDirectory(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    });
}

function createStartupScripts(buildDir) {
    // Windows batch file
    const windowsScript = `@echo off
echo Starting Midjourney Mirror...
echo.
echo Make sure you have configured your .env file!
echo Default admin credentials: admin / admin123
echo.
node src/server.js
pause
`;
    
    fs.writeFileSync(path.join(buildDir, 'start.bat'), windowsScript);
    
    // Linux/Mac shell script
    const unixScript = `#!/bin/bash
echo "Starting Midjourney Mirror..."
echo
echo "Make sure you have configured your .env file!"
echo "Default admin credentials: admin / admin123"
echo
node src/server.js
`;
    
    fs.writeFileSync(path.join(buildDir, 'start.sh'), unixScript);
    
    // Make shell script executable
    try {
        fs.chmodSync(path.join(buildDir, 'start.sh'), '755');
    } catch (error) {
        // Ignore on Windows
    }
    
    console.log('✅ Created startup scripts');
}

function createDeploymentReadme(buildDir) {
    const readme = `# Midjourney Mirror - Deployment Guide

## Quick Start

1. **Install Dependencies**
   \`\`\`bash
   npm install
   \`\`\`

2. **Configure Environment**
   - Copy \`.env.example\` to \`.env\`
   - Edit \`.env\` with your settings

3. **Start the Application**
   - Windows: Double-click \`start.bat\`
   - Linux/Mac: Run \`./start.sh\` or \`npm start\`

## Configuration

### Environment Variables (.env)

- \`PORT\`: Server port (default: 3000)
- \`NODE_ENV\`: Set to 'production' for production deployment
- \`ADMIN_USERNAME\`: Admin login username (default: admin)
- \`ADMIN_PASSWORD\`: Admin login password (default: admin123)
- \`JWT_SECRET\`: Secret key for JWT tokens (change this!)

### Browser Settings

- \`HEADLESS_BROWSER\`: Set to 'false' to see browser windows
- \`BROWSER_TIMEOUT\`: Request timeout in milliseconds
- \`MAX_CONCURRENT_BROWSERS\`: Maximum concurrent browser instances

## Default Login

- Username: \`admin\`
- Password: \`admin123\`

**⚠️ IMPORTANT: Change the default admin password in production!**

## Account Management

1. Login with admin credentials
2. Go to account selection page
3. Add your Midjourney account with cookies
4. Select account to start mirroring

## Security Notes

- Always use HTTPS in production
- Change default admin credentials
- Use a strong JWT secret
- Regularly update dependencies
- Monitor logs for suspicious activity

## Troubleshooting

### Common Issues

1. **Browser Won't Start**
   - Install Chrome/Chromium
   - Check system permissions
   - Try setting \`HEADLESS_BROWSER=false\`

2. **Cloudflare Challenges**
   - Wait for automatic handling
   - Check proxy configuration
   - Verify account cookies

3. **Memory Issues**
   - Reduce \`MAX_CONCURRENT_BROWSERS\`
   - Monitor system resources
   - Restart application periodically

### Logs

Application logs are stored in the \`logs/\` directory:
- \`app.log\`: General application logs
- \`error.log\`: Error logs only

## Production Deployment

### Using PM2 (Recommended)

\`\`\`bash
npm install -g pm2
pm2 start src/server.js --name "midjourney-mirror"
pm2 startup
pm2 save
\`\`\`

### Using Docker

\`\`\`dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
\`\`\`

### Reverse Proxy (Nginx)

\`\`\`nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
\`\`\`

## Support

For issues and questions, check the application logs and ensure all dependencies are properly installed.

---

Generated by Midjourney Mirror Build System
`;
    
    fs.writeFileSync(path.join(buildDir, 'README.md'), readme);
    console.log('✅ Created deployment README');
}

async function packageProject() {
    console.log('📦 Starting packaging process...');
    
    const buildDir = await buildProject();
    const distDir = path.join(__dirname, '../dist');
    const timestamp = new Date().toISOString().slice(0, 10);
    const packageName = `midjourney-mirror-${timestamp}.zip`;
    const packagePath = path.join(distDir, packageName);
    
    // Create zip archive
    const output = fs.createWriteStream(packagePath);
    const archive = archiver('zip', {
        zlib: { level: 9 } // Compression level
    });
    
    return new Promise((resolve, reject) => {
        output.on('close', () => {
            console.log(`📦 Package created: ${packageName}`);
            console.log(`📊 Total size: ${archive.pointer()} bytes`);
            console.log(`📂 Location: ${packagePath}`);
            resolve(packagePath);
        });
        
        archive.on('error', (err) => {
            reject(err);
        });
        
        archive.pipe(output);
        
        // Add files to archive
        archive.directory(buildDir, false);
        
        archive.finalize();
    });
}

// Run if called directly
if (require.main === module) {
    const command = process.argv[2];
    
    if (command === 'package') {
        packageProject().catch(console.error);
    } else {
        buildProject().catch(console.error);
    }
}

module.exports = { buildProject, packageProject };