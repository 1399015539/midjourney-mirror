const { execSync } = require('child_process');
const { packageProject } = require('./build');

async function createExecutablePackage() {
    console.log('🔨 Creating executable package...');
    
    try {
        // First run the normal package process
        const packagePath = await packageProject();
        
        // Create executable using pkg
        console.log('🚀 Creating executable binaries...');
        
        const targets = [
            'node18-linux-x64',
            'node18-macos-x64', 
            'node18-win-x64'
        ];
        
        for (const target of targets) {
            console.log(`📦 Building for ${target}...`);
            
            try {
                execSync(`npx pkg src/server.js --target ${target} --output dist/midjourney-mirror-${target}`, {
                    stdio: 'inherit',
                    cwd: __dirname + '/..'
                });
                
                console.log(`✅ Built ${target} successfully`);
            } catch (error) {
                console.error(`❌ Failed to build ${target}:`, error.message);
            }
        }
        
        console.log('🎉 All packages created successfully!');
        console.log('📂 Check the dist/ directory for your packages');
        
    } catch (error) {
        console.error('❌ Package creation failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    createExecutablePackage();
}

module.exports = { createExecutablePackage };