# Midjourney Mirror Dockerfile
FROM node:18-alpine

# Install basic dependencies
RUN apk add --no-cache \
    curl \
    wget \
    ca-certificates

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with npm config optimizations
RUN npm config set registry https://registry.npmmirror.com && \
    npm config set fetch-retries 3 && \
    npm config set fetch-retry-mintimeout 5000 && \
    npm config set fetch-retry-maxtimeout 60000 && \
    npm config set legacy-peer-deps true && \
    npm install --no-audit --no-fund --prefer-offline

# Copy application source
COPY . .

# Create necessary directories
RUN mkdir -p logs

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["npm", "start"]