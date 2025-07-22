#!/bin/bash

# Midjourney Mirror Quick Start Script
echo "🚀 Midjourney Mirror - Quick Start"
echo "=================================="
echo

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'.' -f1 | cut -d'v' -f2)
if [ "$NODE_VERSION" -lt "18" ]; then
    echo "⚠️  Node.js version 18+ is required. Current version: $(node --version)"
    echo "   Please update Node.js from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node --version) detected"

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Make sure you're in the project directory."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

# Check if .env file exists, if not copy from example
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "📋 Creating .env file from .env.example..."
        cp .env.example .env
        echo "✅ .env file created"
        echo "⚠️  Please review and update the .env file with your settings"
    else
        echo "⚠️  No .env file found. Creating basic configuration..."
        cat > .env << EOL
PORT=3000
NODE_ENV=development
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
JWT_SECRET=your-super-secret-jwt-key-change-in-production
HEADLESS_BROWSER=true
BROWSER_TIMEOUT=30000
MAX_CONCURRENT_BROWSERS=5
EOL
        echo "✅ Basic .env file created"
    fi
else
    echo "✅ .env file exists"
fi

# Create logs directory if it doesn't exist
if [ ! -d "logs" ]; then
    mkdir -p logs
    echo "✅ Created logs directory"
fi

echo
echo "🎉 Setup completed!"
echo
echo "📋 Quick Info:"
echo "   • Default login: admin / admin123"
echo "   • Server will run on: http://localhost:3000"
echo "   • Make sure to add your Midjourney cookies after login"
echo
echo "🚀 Starting Midjourney Mirror..."
echo

# Start the application
npm start