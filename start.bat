@echo off
title Midjourney Mirror - Quick Start
color 0A

echo.
echo 🚀 Midjourney Mirror - Quick Start
echo ==================================
echo.

:: Check if Node.js is installed
node --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    echo    Download from: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js detected: 
node --version

:: Check if package.json exists
if not exist package.json (
    echo ❌ package.json not found. Make sure you're in the project directory.
    pause
    exit /b 1
)

:: Install dependencies if node_modules doesn't exist
if not exist node_modules (
    echo 📦 Installing dependencies...
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
    echo ✅ Dependencies installed
) else (
    echo ✅ Dependencies already installed
)

:: Check if .env file exists, if not copy from example
if not exist .env (
    if exist .env.example (
        echo 📋 Creating .env file from .env.example...
        copy .env.example .env >nul
        echo ✅ .env file created
        echo ⚠️  Please review and update the .env file with your settings
    ) else (
        echo ⚠️  No .env file found. Creating basic configuration...
        (
            echo PORT=3000
            echo NODE_ENV=development
            echo ADMIN_USERNAME=admin
            echo ADMIN_PASSWORD=admin123
            echo JWT_SECRET=your-super-secret-jwt-key-change-in-production
            echo HEADLESS_BROWSER=true
            echo BROWSER_TIMEOUT=30000
            echo MAX_CONCURRENT_BROWSERS=5
        ) > .env
        echo ✅ Basic .env file created
    )
) else (
    echo ✅ .env file exists
)

:: Create logs directory if it doesn't exist
if not exist logs mkdir logs
echo ✅ Logs directory ready

echo.
echo 🎉 Setup completed!
echo.
echo 📋 Quick Info:
echo    • Default login: admin / admin123
echo    • Server will run on: http://localhost:3000
echo    • Make sure to add your Midjourney cookies after login
echo.
echo 🚀 Starting Midjourney Mirror...
echo.

:: Start the application
call npm start

echo.
echo Application has stopped. Press any key to exit.
pause >nul