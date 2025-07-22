#!/bin/bash

# FlareSolverr Installation and Startup Script for Midjourney Mirror

echo "🚀 Starting FlareSolverr for Midjourney Mirror..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first:"
    echo "   - macOS: https://docs.docker.com/desktop/mac/install/"
    echo "   - Windows: https://docs.docker.com/desktop/windows/install/"
    echo "   - Linux: https://docs.docker.com/engine/install/"
    exit 1
fi

# Check if FlareSolverr container is already running
if docker ps | grep -q flaresolverr; then
    echo "✅ FlareSolverr is already running!"
    echo "📍 FlareSolverr URL: http://localhost:8191"
    exit 0
fi

# Check if container exists but is stopped
if docker ps -a | grep -q flaresolverr; then
    echo "🔄 Starting existing FlareSolverr container..."
    docker start flaresolverr
else
    echo "📦 Downloading and starting FlareSolverr..."
    docker run -d \
        --name=flaresolverr \
        -p 8191:8191 \
        --restart unless-stopped \
        ghcr.io/flaresolverr/flaresolverr:latest
fi

# Wait for container to start
echo "⏳ Waiting for FlareSolverr to start..."
sleep 5

# Check if FlareSolverr is responding
for i in {1..10}; do
    if curl -s http://localhost:8191/v1 > /dev/null 2>&1; then
        echo "✅ FlareSolverr is running successfully!"
        echo "📍 FlareSolverr URL: http://localhost:8191"
        echo ""
        echo "🎉 You can now start the Midjourney Mirror:"
        echo "   npm start"
        exit 0
    fi
    echo "   Checking... ($i/10)"
    sleep 2
done

echo "❌ FlareSolverr failed to start properly. Please check Docker logs:"
echo "   docker logs flaresolverr"
exit 1