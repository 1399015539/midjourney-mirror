# Midjourney Mirror 部署说明

## 🚀 快速开始

### 自动启动（推荐）

**Windows 用户：**
1. 双击 `start.bat` 文件
2. 等待自动安装依赖和配置
3. 浏览器打开 http://localhost:3000

**Linux/Mac 用户：**
1. 运行 `./start.sh`（或 `bash start.sh`）
2. 等待自动安装依赖和配置  
3. 浏览器打开 http://localhost:3000

### 手动启动

1. **安装依赖**
   ```bash
   npm install
   ```

2. **配置环境**
   ```bash
   cp .env.example .env
   # 编辑 .env 文件配置您的设置
   ```

3. **启动应用**
   ```bash
   npm start
   ```

## 🔐 默认登录信息

- **用户名:** `admin`
- **密码:** `admin123`

**⚠️ 重要：生产环境请务必修改默认密码！**

## 📝 使用流程

1. **登录系统**
   - 使用默认凭据登录管理后台

2. **添加 Midjourney 账号**
   - 点击"添加新账号"
   - 输入账号名称和邮箱
   - 粘贴您的 Midjourney Cookie（已提供示例）

3. **选择账号进入镜像**
   - 从账号列表中选择一个活跃账号
   - 系统将自动创建镜像会话
   - 开始使用 Midjourney 镜像功能

## 🛠️ 核心功能特性

### ✨ CF 绕过技术
- 自动处理 Cloudflare 挑战
- 浏览器指纹伪造
- TLS 指纹随机化
- 智能代理轮换

### 🔄 会话管理
- 多账号支持
- 独立浏览器环境
- 会话状态同步
- 自动会话清理

### 🌐 API 代理
- 完整 API 请求代理
- 静态资源代理
- WebSocket 支持
- CDN 资源处理

### 🎯 镜像功能
- 实时内容获取
- 动态 URL 重写
- 跨域请求处理
- 响应内容处理

## 📦 一键打包部署

### 创建分发包
```bash
npm run build    # 创建构建版本
npm run package  # 创建完整部署包
```

### 可执行文件打包
系统会自动生成以下平台的可执行文件：
- `midjourney-mirror-linux-x64`
- `midjourney-mirror-macos-x64`  
- `midjourney-mirror-win-x64`

## ⚙️ 配置选项

### 环境变量 (.env)
```bash
# 服务器配置
PORT=3000
NODE_ENV=development

# 管理员凭据
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123

# JWT 密钥（生产环境必须修改）
JWT_SECRET=your-super-secret-jwt-key

# 浏览器配置
HEADLESS_BROWSER=true
BROWSER_TIMEOUT=30000
MAX_CONCURRENT_BROWSERS=5
```

## 🚨 故障排除

### 常见问题

1. **浏览器启动失败**
   - 安装 Chrome/Chromium
   - 检查系统权限
   - 尝试设置 `HEADLESS_BROWSER=false`

2. **Cloudflare 挑战**
   - 等待自动处理（通常30秒内）
   - 检查代理配置
   - 验证账号 Cookie 有效性

3. **内存不足**
   - 减少 `MAX_CONCURRENT_BROWSERS` 值
   - 定期重启应用程序
   - 监控系统资源使用

4. **Cookie 失效**
   - 重新获取 Midjourney Cookie
   - 确保 Cookie 格式正确
   - 检查账号登录状态

### 日志查看
- 应用日志：`logs/app.log`
- 错误日志：`logs/error.log`
- 控制台输出：实时显示运行状态

## 🔒 安全建议

- ✅ 生产环境使用 HTTPS
- ✅ 修改默认管理员密码
- ✅ 使用强 JWT 密钥
- ✅ 定期更新依赖包
- ✅ 监控应用日志
- ✅ 限制网络访问权限

## 🌟 技术架构

```
前端界面 ──→ Express 服务器 ──→ Puppeteer 浏览器集群
    │              │                    │
    │              ├──→ API 代理层      │
    │              ├──→ 会话管理        │
    │              └──→ 静态资源代理    │
    │                                   │
    └──────────────────────────────────┘
                   镜像内容返回
```

## 📋 系统要求

- **Node.js:** 18.0.0 或更高版本
- **内存:** 最少 2GB RAM（推荐 4GB+）
- **存储:** 最少 1GB 可用空间
- **网络:** 稳定的互联网连接
- **浏览器:** Chrome/Chromium（自动安装）

---

🎉 **现在您可以开始使用 Midjourney Mirror 了！**

如遇到问题，请检查日志文件并确保所有依赖项已正确安装。