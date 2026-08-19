# Inbox Mate PRO - 专业级多账户邮件读取与验证码智能提取系统

<p align="center">
  <img src="https://img.shields.io/badge/Version-PRO%20v3.0.0-0ea5e9?style=for-the-badge&logo=appveyor" alt="Version PRO v3.0.0"/>
  <img src="https://img.shields.io/badge/License-MIT-green.style=for-the-badge" alt="MIT License"/>
  <img src="https://img.shields.io/badge/Security-Local%20Only%20Sandbox-emerald?style=for-the-badge" alt="Local Only Sandbox"/>
  <img src="https://img.shields.io/badge/Protocol-Graph%20API%20%7C%20IMAP%20%7C%20Chrome%20RPA-blue?style=for-the-badge" alt="Graph API, IMAP, RPA"/>
</p>

<p align="center">
  <strong>Inbox Mate PRO</strong> 是一款专为高效批处理设计的高性能、全协议支持、多账户邮件读取与验证码智能提炼系统。<br/>
  原生集成 <strong>Microsoft Graph REST API (4段式令牌免登)</strong>、<strong>Mail.com Chrome RPA 无头拟人化浏览器引擎</strong>、<strong>IMAP TLS / XOAUTH2</strong>、<strong>商业多节点代理智能路由池</strong> 与 <strong>全链路可视化审计诊断系统</strong>。
</p>

---

## ✨ 核心功能矩阵

### 1. 🚀 三核协议驱动引擎（Graph API / IMAP / Chrome RPA）
- **Microsoft Graph REST API 引擎**：支持 4 段式 Refresh Token 秒级免密抓取，绕过任何前端交互与双重验证。
- **Mail.com Chrome RPA 极速无头引擎**：
  - 针对 Mail.com 关闭免费 IMAP 协议的场景，原生集成无头浏览器（Playwright 内核）；
  - **拟人化击键仿真**：注入 8~12ms 自然高斯微抖动击键，完全具备真实人类遥测特征，有效避免机房 IP 被拉黑；
  - **深度资源瘦身过滤**：自动阻断 50+ 个第三方广告竞价网络、媒体、视频、Webfonts 字体与追踪 SDK，节省 90% 流量开销；
  - **GDPR / 中转弹窗 0 延迟穿透**：浏览器引擎内部单次原生 `evaluate` 快速跳过协议条款与推广弹窗（耗时 <2ms）；
  - **Ajax 数据流截获**：200ms 高频侦听与 `maillist.mail.com` 底层数据流即时捕获，数据到达即刻返回。
- **标准 IMAP TLS 引擎**：支持 Mail.ru、GMX、Rambler、Outlook、Hotmail 等主流协议并发收信。

### 2. 🌐 商业多节点代理智能路由池 (Proxy Intelligent Routing)
- **多协议代理支持**：支持 HTTP、HTTPS 与 SOCKS5 商业代理节点池（如住宅代理、静态 ISP 专享代理）。
- **三大智能调度模式**：
  - **优先机房直连 (Direct First - 强烈推荐)**：日常请求 100% 走机房高速专网（16s ~ 18s 极速），仅在触发 403 / 429 目标安全风控时，自动无感故障转移至可用代理池重试；
  - **全量代理轮询 (Proxy Pool)**：所有请求在健康代理节点池中负载均衡轮询；
  - **纯机房直连 (Direct Only)**：关闭代理，全部走本机网络。
- **毫秒级网络熔断与即时切换**：
  - 深度捕获 `ERR_TUNNEL_CONNECTION_FAILED`、`ERR_EMPTY_RESPONSE` 及 `chrome-error:` 错误页，0.1 秒内快速剔除不可用节点并轮换下一节点。
- **节点健康度探测**：后台支持一键并发延迟测速、可用性探测与节点启用/停用控制。

### 3. 🤖 AI / Regex 智能验证码提炼引擎
- **多模态语义提炼**：自动识别多语言邮件正文中的 4-8 位验证码、重置密码链接与激活口令。
- **置信度评估体系**：提供 `High` / `Medium` / `Low` 三级置信度评分与绿色视觉卡片。
- **一键快捷复制**：提供触觉震动反馈（`navigator.vibrate`）与剪贴板一键复制。

### 4. 🔍 全链路可视化审计与智能诊断 (Visual Auditing & Forensics)
- **生命周期轨迹追踪**：精准记录启动浏览器、导航、登录、拦截、解析到提取验证码的每一步精确时间戳。
- **现场视觉快照 (Forensics Snapshot)**：在发生超时或风控异常时，自动捕获现场页面截图与源码留证。
- **用户审计与 IP 风控管理**：
  - 详细审计客户端真实 IP、地理归属、脱敏账号、执行状态、耗时与调用来源；
  - 支持一键导出全量审计 CSV 报表；
  - 支持动态限流与恶意 IP 黑名单拉黑（IP Ban Management）。

### 5. 🎨 现代响应式 UI/UX 设计
- **多端自适应**：支持桌面端全功能侧边栏与移动端沉浸式体验。
- **全主题切换**：支持 **跟随系统 💻**、**亮色清爽 ☀️**、**暗色极客 🌙**。
- **防抖检索与分页**：支持 250ms 防抖即时关键字搜索，支持 `12` / `24` / `48` / `96` / `全部` 动态分页控制。

---

## 🌐 邮箱服务商与导入格式说明

Inbox Mate PRO 完美支持以下主流邮箱服务商，支持在界面中直接粘贴或批量导入（支持 `----`、`\t`、`|`、`:` 作为分隔符）：

| 服务商 | 支持域名 | 授权方式 / 协议引擎 | 格式范例 |
| :--- | :--- | :--- | :--- |
| **Mail.com** | `mail.com`, `email.com`, `usa.com` 等 | Chrome RPA 拟人化无头引擎 | `账号----密码` |
| **Microsoft 阵列** | `outlook.com`, `hotmail.com`, `live.com`, `msn.com` | Graph REST API (4段式免登) / IMAP | `邮箱----密码----客户端ID----刷新令牌` |
| **Mail.ru** | `mail.ru`, `inbox.ru`, `list.ru`, `bk.ru` | IMAP TLS (应用专用密码) | `邮箱----应用专用密码` |
| **GMX 邮箱** | `gmx.com`, `gmx.net`, `gmx.de` | IMAP TLS (账号密码 / 专用密码) | `邮箱----密码` |
| **Rambler** | `rambler.ru`, `myrambler.ru`, `ro.ru` | IMAP TLS (专用密码) | `邮箱----密码` |

---

## 🛠️ 本地开发与本地运行指南

### 前提条件
- **Node.js**: `>= 20.0.0`
- **Package Manager**: `npm` (`>= 10.0.0`)

### 1. 开发模式启动 (Development Mode)
```bash
# 1. 克隆项目仓库
git clone https://github.com/your-org/Inbox-Mate.git
cd Inbox-Mate

# 2. 安装依赖并安装 Playwright Chromium 内核
npm install
npx playwright install chromium

# 3. 启动开发服务器 (并发启动 Vite 前端 5173 与 Node 后端 3000)
npm run dev
```
访问地址：`http://127.0.0.1:5173`

---

### 2. 本地生产构建模式 (Production Mode)
```bash
# 1. 编译 TypeScript 与 Vite 生产前端包
npm run build

# 2. 启动生产模式本地服务器 (默认端口 3000)
npm start
```
访问地址：👉 **`http://127.0.0.1:3000`**

---

### 3. 自动化测试套件 (Unit Tests)
```bash
npm test
```
覆盖范围：13 个测试套件，**147 项自动化单元测试**（涵盖 RPA 核心引擎、代理池路由、IP 风控、AI 提取算法、Job 任务流等）。

---

## ☁️ 线上生产环境部署指南 (PM2 + Nginx)

线上标准生产部署架构图如下：

```text
[ 客户端浏览器 ] ---> (HTTPS / WSS 443) ---> [ Nginx 反向代理网关 ]
                                                    |
                   +--------------------------------+--------------------------------+
                   |                                                                 |
         (前端静态 SPA 页面)                                               (后端 REST API / SSE 流)
         [ /www/wwwroot/your-domain.com ]                                  [ Proxy Pass http://127.0.0.1:3005 ]
         ├── index.html                                                    └── PM2 守护进程: inbox-mate
         └── assets/ (CSS/JS)                                                   └── Express + Playwright Engine
```

### 1. 服务器环境准备
在 Linux 服务器（Ubuntu / Debian / CentOS / 宝塔面板）上安装基础运行环境：
```bash
# 安装 Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs pm2

# 安装 Chromium 运行所需的系统依赖库
npx playwright install-deps chromium
```

---

### 2. 首次部署与服务拉起
```bash
# 1. 进入服务器网站根目录
cd /www/wwwroot/your-domain.com

# 2. 安装依赖与 Playwright 浏览器内核
npm install
npx playwright install chromium

# 3. 编译前端静态产物并拷贝至根目录
npm run build
cp -rf dist/* ./

# 4. 使用 PM2 守护进程启动后端 Node 服务 (指定监听 3005 端口)
PORT=3005 NODE_ENV=production pm2 start npx --name "inbox-mate" -- tsx src/server/index.ts
pm2 save
pm2 startup
```

---

### 3. Nginx 反向代理配置范例 (`/etc/nginx/conf.d/inbox-mate.conf`)

> [!NOTE]
> 请将配置中的 `your-domain.com` 替换为您自己的真实解析域名，并将 SSL 证书路径指向您的实际文件。

```nginx
server {
    listen 80;
    listen 443 ssl;
    http2 on;
    server_name your-domain.com;
    root /www/wwwroot/your-domain.com;
    index index.html index.htm;

    # SSL 证书配置 (请替换为实际路径)
    ssl_certificate /etc/nginx/ssl/your-domain.com.fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/your-domain.com.privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # 后端 REST API & SSE 数据流代理 (转发至 3005 端口)
    location /api/ {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # 前端单页面应用 (SPA) 路由支持
    location / {
        try_files $uri $uri/ /index.html;
    }

    access_log /var/log/nginx/inbox-mate.access.log;
    error_log /var/log/nginx/inbox-mate.error.log;
}
```

---

### 4. 日常 Git 一键更新发布流程

在更新代码后，在服务器终端执行标准发布命令：

```bash
cd /www/wwwroot/your-domain.com

# 1. 拉取最新代码
git pull

# 2. 构建生产静态前端
npm run build && cp -rf dist/* ./

# 3. 平滑重启后端 PM2 进程
pm2 reload inbox-mate

# 4. 重载 Nginx
sudo nginx -s reload
```

---

### 5. 运维诊断与健康检查常用命令

```bash
# 查看 PM2 进程运行状态
pm2 status inbox-mate

# 查看实时运行日志 (最近 100 行)
pm2 logs inbox-mate --lines 100

# 检查后端健康状态接口
curl -sk https://your-domain.com/api/v1/health

# 检查代理节点连通性 (后端接口)
curl -sk https://your-domain.com/api/v1/proxies/test-all
```

---

## 🔒 安全与凭据脱敏规范

1. **凭据零落地 (Zero-Persistence by Default)**：邮箱密码与刷新令牌仅在运行内存中即时解密使用，执行完成后即刻清理，不落任何外部存储。
2. **脱敏日志输出**：所有前端卡片、审计日志及系统输出均对邮箱进行脱敏掩码（如 `torr***@mail.com`），绝不打印密码或敏感 Token。
3. **安全风控隔离**：内置请求频次熔断与 IP 限流机制，保障服务稳定运行。

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 许可证。
