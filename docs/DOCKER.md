# Docker 部署指南

## 🚀 快速开始

### 方式1：开发环境 (推荐本地测试)

```bash
# 启动开发环境 (包含 FlareSolverr + 应用)
npm run docker:dev

# 或者直接使用 docker-compose
docker-compose -f docker-compose.dev.yml up --build
```

### 方式2：生产环境

```bash
# 启动生产环境
npm run docker:prod

# 或者直接使用 docker-compose
docker-compose up --build -d
```

## 📋 服务说明

启动后包含以下服务：

| 服务 | 端口 | 说明 |
|------|------|------|
| Midjourney Mirror | `3000` | 主应用 |
| FlareSolverr | `8191` | CF绕过服务 |

访问地址：
- **应用**: http://localhost:3000
- **FlareSolverr**: http://localhost:8191

## 🛠 Docker 命令

```bash
# 构建镜像
npm run docker:build

# 开发环境启动
npm run docker:dev

# 生产环境启动 (后台运行)
npm run docker:prod

# 查看日志
npm run docker:logs

# 停止所有服务
npm run docker:down

# 清理所有容器和镜像
npm run docker:clean
```

## 🔧 环境配置

### 开发环境配置
在 `docker-compose.dev.yml` 中修改环境变量：

```yaml
environment:
  - NODE_ENV=development
  - ADMIN_USERNAME=admin
  - ADMIN_PASSWORD=admin123
  - JWT_SECRET=dev-secret-key
  - LOG_LEVEL=debug
```

### 生产环境配置
在 `docker-compose.yml` 中修改环境变量：

```yaml
environment:
  - NODE_ENV=production
  - ADMIN_USERNAME=admin
  - ADMIN_PASSWORD=change-this-password
  - JWT_SECRET=your-super-secret-jwt-key
  - LOG_LEVEL=info
```

**⚠️ 重要：生产环境请修改默认密码和密钥！**

## 📊 监控和日志

### 查看日志
```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f midjourney-mirror-app
docker-compose logs -f midjourney-flaresolverr
```

### 健康检查
```bash
# 应用健康检查
curl http://localhost:3000/api/health

# FlareSolverr健康检查
curl http://localhost:8191/v1
```

## 🚢 服务器部署

### CentOS 服务器部署

1. **安装Docker和Docker Compose**:
```bash
# 安装Docker
sudo yum update -y
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo yum install -y docker-ce docker-ce-cli containerd.io
sudo systemctl start docker
sudo systemctl enable docker

# 安装Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

2. **部署应用**:
```bash
# 克隆项目
git clone <your-repo-url>
cd midjourney-mirror

# 修改生产环境配置
cp docker-compose.yml docker-compose.prod.yml
# 编辑 docker-compose.prod.yml 修改密码等配置

# 启动服务
docker-compose -f docker-compose.prod.yml up -d --build

# 查看状态
docker-compose ps
```

3. **防火墙配置**:
```bash
# 开放端口
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --add-port=8191/tcp
sudo firewall-cmd --reload
```

## 🐛 故障排除

### 常见问题

1. **端口被占用**:
```bash
# 查看端口占用
lsof -i :3000
lsof -i :8191

# 修改docker-compose.yml中的端口映射
ports:
  - "3001:3000"  # 使用3001端口
```

2. **FlareSolverr启动失败**:
```bash
# 查看FlareSolverr日志
docker-compose logs flaresolverr

# 重启FlareSolverr
docker-compose restart flaresolverr
```

3. **应用连接不上FlareSolverr**:
```bash
# 检查网络连接
docker-compose exec midjourney-mirror-app ping flaresolverr
```

4. **内存不足**:
```bash
# 查看资源使用
docker stats

# 增加Docker内存限制（Docker Desktop）
# 或者增加服务器内存
```

### 日志分析
```bash
# 查看详细错误日志
docker-compose logs --tail=100 midjourney-mirror-app

# 进入容器调试
docker-compose exec midjourney-mirror-app sh
```

## 🔄 更新部署

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose up --build -d

# 或者使用npm脚本
npm run docker:prod
```

## 📝 注意事项

1. **资源要求**:
   - RAM: 最少2GB，推荐4GB
   - 磁盘: 最少5GB可用空间

2. **安全建议**:
   - 修改默认管理员密码
   - 使用强随机JWT密钥
   - 不要暴露8191端口到公网

3. **网络配置**:
   - 确保Docker网络正常
   - FlareSolverr需要访问外网
   - 防火墙要开放相应端口