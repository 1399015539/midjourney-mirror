@echo off
REM FlareSolverr Installation and Startup Script for Midjourney Mirror (Windows)

echo 🚀 Starting FlareSolverr for Midjourney Mirror...

REM Check if Docker is installed
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed. Please install Docker Desktop first:
    echo    https://docs.docker.com/desktop/windows/install/
    pause
    exit /b 1
)

REM Check if FlareSolverr container is already running
docker ps | findstr flaresolverr >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ FlareSolverr is already running!
    echo 📍 FlareSolverr URL: http://localhost:8191
    pause
    exit /b 0
)

REM Check if container exists but is stopped
docker ps -a | findstr flaresolverr >nul 2>&1
if %errorlevel% equ 0 (
    echo 🔄 Starting existing FlareSolverr container...
    docker start flaresolverr
) else (
    echo 📦 Downloading and starting FlareSolverr...
    docker run -d --name=flaresolverr -p 8191:8191 --restart unless-stopped ghcr.io/flaresolverr/flaresolverr:latest
)

REM Wait for container to start
echo ⏳ Waiting for FlareSolverr to start...
timeout /t 5 /nobreak >nul

REM Check if FlareSolverr is responding
for /l %%i in (1,1,10) do (
    powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:8191/v1' -UseBasicParsing -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
    if %errorlevel% equ 0 (
        echo ✅ FlareSolverr is running successfully!
        echo 📍 FlareSolverr URL: http://localhost:8191
        echo.
        echo 🎉 You can now start the Midjourney Mirror:
        echo    npm start
        pause
        exit /b 0
    )
    echo    Checking... (%%i/10)
    timeout /t 2 /nobreak >nul
)

echo ❌ FlareSolverr failed to start properly. Please check Docker logs:
echo    docker logs flaresolverr
pause
exit /b 1