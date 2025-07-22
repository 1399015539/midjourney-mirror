# FlareSolverr Setup Guide

FlareSolverr is required to bypass Cloudflare protection when accessing Midjourney. This guide will help you set it up.

## Quick Start

### Option 1: Using npm scripts (Recommended)

```bash
# For macOS/Linux
npm run flaresolverr

# For Windows
npm run flaresolverr:win
```

### Option 2: Manual Docker setup

```bash
docker run -d \
  --name=flaresolverr \
  -p 8191:8191 \
  --restart unless-stopped \
  ghcr.io/flaresolverr/flaresolverr:latest
```

### Option 3: Docker Compose

Create a `docker-compose.yml` file:

```yaml
version: '3.8'
services:
  flaresolverr:
    image: ghcr.io/flaresolverr/flaresolverr:latest
    container_name: flaresolverr
    ports:
      - "8191:8191"
    restart: unless-stopped
    environment:
      - LOG_LEVEL=info
```

Then run:
```bash
docker-compose up -d
```

## Verification

Once FlareSolverr is running, verify it's working:

```bash
curl http://localhost:8191/v1
```

You should see a JSON response indicating FlareSolverr is ready.

## Configuration

The Midjourney Mirror is configured to use FlareSolverr by default. You can modify the settings in your `.env` file:

```env
FLARESOLVERR_URL=http://localhost:8191
FLARESOLVERR_ENABLED=true
```

## Troubleshooting

### FlareSolverr not starting
1. Make sure Docker is installed and running
2. Check if port 8191 is already in use: `lsof -i :8191` (macOS/Linux) or `netstat -an | findstr 8191` (Windows)
3. Check Docker logs: `docker logs flaresolverr`

### Connection errors
1. Verify FlareSolverr is running: `docker ps | grep flaresolverr`
2. Test the endpoint: `curl http://localhost:8191/v1`
3. Check firewall settings

### Performance issues
- FlareSolverr uses a real browser, so it requires more resources
- Consider increasing Docker memory allocation if running in Docker Desktop
- Monitor CPU and memory usage

## Advanced Configuration

### Custom browser settings
You can configure FlareSolverr with environment variables:

```bash
docker run -d \
  --name=flaresolverr \
  -p 8191:8191 \
  -e LOG_LEVEL=debug \
  -e CAPTCHA_SOLVER=none \
  -e TZ=America/New_York \
  --restart unless-stopped \
  ghcr.io/flaresolverr/flaresolverr:latest
```

### Using with a proxy
```bash
docker run -d \
  --name=flaresolverr \
  -p 8191:8191 \
  -e PROXY_URL=http://proxy-server:8080 \
  --restart unless-stopped \
  ghcr.io/flaresolverr/flaresolverr:latest
```

## Security Notes

- FlareSolverr runs a full browser instance
- Only expose it locally (localhost:8191) unless you understand the security implications
- Consider running it in a sandboxed environment for production use

## More Information

- [FlareSolverr GitHub Repository](https://github.com/FlareSolverr/FlareSolverr)
- [FlareSolverr Documentation](https://github.com/FlareSolverr/FlareSolverr/wiki)