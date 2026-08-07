# Inbox Mate PRO - 专业级多账户邮件读取与验证码智能提取助手

<p align="center">
  <img src="https://img.shields.io/badge/Version-PRO%20v2.4.0-0ea5e9?style=for-the-badge&logo=appveyor" alt="Version PRO v2.4.0"/>
  <img src="https://img.shields.io/badge/License-MIT-green.style=for-the-badge" alt="MIT License"/>
  <img src="https://img.shields.io/badge/Security-Local%20Only%20Sandbox-emerald?style=for-the-badge" alt="Local Only Sandbox"/>
  <img src="https://img.shields.io/badge/Protocol-Graph%20API%20%2F%20IMAP-blue?style=for-the-badge" alt="Graph API & IMAP"/>
</p>

<p align="center">
  <strong>Inbox Mate PRO</strong> 是一款专为高效批处理设计的高性能、纯本地内存沙盒 (Local-Only Sandbox) 多账户邮件读取与验证码智能提炼系统。<br/>
  原生支持 <strong>Microsoft Graph REST API (刷新令牌免登录抓取)</strong>、<strong>Mail.ru</strong>、<strong>GMX</strong>、<strong>Rambler</strong>、<strong>Outlook</strong>、<strong>Hotmail</strong>、<strong>Offilive</strong> 等主流邮箱协议，凭据绝不落盘，随用随清。
</p>

---

## ✨ 核心功能亮点

### 1. 🚀 50+ 账户并发与双引擎抓取
- **双协议引擎**：支持 **Microsoft Graph REST API** 与 **IMAP TLS / XOAUTH2** 混合并发调配，绕过传统客户端限制。
- **4段式 Refresh Token 免登录速通**：直接通过微软 OAuth2 刷新令牌（Refresh Token）发起 Graph API 请求，无需浏览器人工二次点击。
- **高并发处理**：单次任务支持多达 50 个邮箱账户并行检索，毫秒级流式返回邮件正文。

### 2. 🤖 AI / Regex 智能验证码提炼引擎
- **自动提取**：多维语义识别与正则匹配算法，自动从复杂 HTML / 纯文本正文中高精度提炼 4-8 位验证码。
- **置信度评估**：提供 `High` / `Medium` / `Low` 三级置信度评分与绿色高亮卡片。
- **一键快捷复制**：提供触觉震动反馈（`navigator.vibrate`）与剪贴板一键复制功能。

### 3. 🔍 邮件海量检索与动态分页控制
- **即时检索**：支持对邮件主题、发件人、正文关键字及提取出的验证码进行 250ms 防抖（Debounce）实时搜索。
- **动态分页控制**：支持自由选择 `12` / `24` / `48` / `96` 封或 `全部展示` 动态分页，大容量检索顺畅无卡顿。

### 4. 🎨 顶级 UI/UX 设计与桌面/移动自适应
- **主题模式切换**：支持 **跟随系统 💻**、**亮色清爽 ☀️**、**暗色极客 🌙** 一键无缝切换。
- **PC 侧边栏吸底布局**：配置区域自动固定在侧边栏最下方，中间账号队列根据视口高度自动弹性扩充（单页轻松展示 20+ 账号）。
- **防溢出与单行防护**：卡片正文长 URL 自动折行，状态标签（`[未执行]`、`[Graph 令牌]`）与按钮（`[保存] [取消]`）全端保持标准单行无折叠展示。

### 5. 🔒 纯本地内存沙盒 (Local-Only Sandbox)
- **100% 内存即时处理**：无任何持久化数据库 (MySQL/SQLite/Redis)，数据全部保存在 Node.js 进程内存中。
- **零痕迹关页即抹除**：浏览器关闭或服务终止即刻彻底清理凭据与邮件快照。
- **安全防护**：后端严格绑定 `127.0.0.1` 接口，配合 SameSite CSRF 动态校验。

---

## 🌐 邮箱服务商与导入格式说明

Inbox Mate PRO 完美支持以下主流邮箱服务商及导入格式，支持在界面中直接粘贴或批量导入：

### 1. 支持的服务商矩阵

| 服务商 | 域名支持 | 授权方式 / 协议 | 识别标识 |
| :--- | :--- | :--- | :--- |
| **Microsoft 阵列** | `outlook.com`, `hotmail.com`, `offilive.com`, `live.com`, `msn.com` | Microsoft Graph API / OAuth 2.0 | `M` (蓝色) / `[Graph 令牌]` |
| **Mail.ru 邮箱** | `mail.ru`, `inbox.ru`, `list.ru`, `bk.ru`, `internet.ru` | IMAP TLS (外置应用专用密码) | `M` (深蓝) |
| **GMX 邮箱** | `gmx.com`, `gmx.net`, `gmx.de`, `gmx.at`, `gmx.ch` 等 | IMAP TLS (账号密码 / 专用密码) | `G` (蓝色) |
| **Rambler 邮箱** | `rambler.ru`, `myrambler.ru`, `ro.ru`, `lenta.ru` 等 | IMAP TLS (账号密码 / 专用密码) | `R` (紫色) |

---

### 2. 标准导入格式范例

在左侧【**批量导入**】或【**单账号添加**】中，支持复制粘贴以下格式（支持 `----`、`\t`、`|`、`:` 作为分隔符）：

```text
# 【格式 1】微软 4 段式 Graph API 刷新令牌免登录抓取 (强烈推荐)
CurtissRuecker413208@outlook.com----bpyfhb18392----9e5f94bc-e8a4-4e73-b8be-63364c29d753----M.C507_SN1.0.U.MsaArtifacts...

# 【格式 2】微软 / Outlook / Hotmail / Offilive 单邮箱在线一键授权
name@outlook.com
name@hotmail.com

# 【格式 3】Mail.ru 邮箱 (使用外置应用专用密码)
name@mail.ru----外置应用专用密码

# 【格式 4】GMX 邮箱 (账号密码)
name@gmx.com----密码

# 【格式 5】Rambler 邮箱 (账号密码)
name@rambler.ru----密码
```

---

## 🛠️ 本地开发与本地生产部署指南

### 前提条件
- **Node.js**: `>= 20.0.0`
- **Package Manager**: `npm` (`>= 10.0.0`)

---

### 1. 开发模式启动 (Development Mode)

适用于代码修改与热重载预览：

```bash
# 1. 克隆项目仓库
git clone https://github.com/tankeito/Inbox-Mate.git
cd Inbox-Mate

# 2. 安装依赖
npm install

# 3. 启动开发服务器 (自动并发启动 Vite 前端 5173 与 Node 后端 3000)
npm run dev
```

访问地址：`http://127.0.0.1:5173`

---

### 2. 本地生产构建模式 (Production Mode)

适用于本地生产环境稳定运行：

```bash
# 1. 编译 TypeScript 与 Vite 生产资源
npm run build

# 2. 启动生产模式本地服务器
npm start
```

访问地址：👉 **`http://127.0.0.1:3000`**

---

### 3. 自动化测试套件 (Unit Tests)

```bash
npm test
```

覆盖范围：验证码正则匹配器、4段式凭据解析器、Zod 严格 Schema 校验、Job 并发管理器单元测试。

---

## ☁️ 线上生产环境部署指南 (PM2 + Nginx)

参照系统官方部署文档 [`doc/Inbox_Mate_Deployment_Guide.pdf`](doc/Inbox_Mate_Deployment_Guide.pdf)，线上部署架构如下：

```text
[ 浏览器 Client ] ---> (HTTPS / WSS Port 443) ---> [ Nginx 反向代理 ]
                                                          |
                 +----------------------------------------+----------------------------------------+
                 |                                                                                 |
     (前端静态 SPA 页面)                                                                 (后端 API & SSE 通信)
     [ /www/wwwroot/inbox.btc354.com ]                                                  [ Proxy Pass http://127.0.0.1:3005 ]
     ├── index.html                                                                     └── PM2 守护进程: inbox-mate
     └── assets/ (CSS/JS)                                                                    └── Express Node.js Engine
```

### 1. 服务器环境与基础配置

- **线上访问公网入口**：`https://inbox.btc354.com`
- **项目服务器路径**：`/www/wwwroot/inbox.btc354.com`
- **后端 Node 服务监听端口**：`3005` (`PORT=3005`)
- **PM2 守护进程名称**：`inbox-mate`

---

### 2. 首次线上服务启动命令

```bash
cd /www/wwwroot/inbox.btc354.com

# 安装依赖并编译生产产物
npm install
npm run build
cp -rf dist/* ./

# 使用 PM2 启动后端 Node 守护进程 (指定监听 3005 端口)
PORT=3005 NODE_ENV=production pm2 start npx --name "inbox-mate" -- tsx src/server/index.ts
pm2 save
```

---

### 3. Nginx 反向代理与 HTTPS 配置 (`/www/server/panel/vhost/nginx/inbox.btc354.com.conf`)

```nginx
server {
    listen 80;
    listen 443 ssl;
    http2 on;
    server_name inbox.btc354.com;
    root /www/wwwroot/inbox.btc354.com;
    index index.html index.htm;

    # SSL 证书配置
    ssl_certificate /www/server/panel/vhost/cert/inbox.btc354.com/fullchain.pem;
    ssl_certificate_key /www/server/panel/vhost/cert/inbox.btc354.com/privkey.pem;
    ssl_protocols TLSv1.1 TLSv1.2 TLSv1.3;
    ssl_ciphers EECDH+CHACHA20:EECDH+CHACHA20-draft:EECDH+AES128:RSA+AES128:EECDH+AES256:RSA+AES256:EECDH+3DES:RSA+3DES:!MD5;
    ssl_prefer_server_ciphers on;

    # 后端 API & SSE 流代理 (转发至 3005 端口)
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

    access_log /www/wwwlogs/inbox.btc354.com.log;
    error_log /www/wwwlogs/inbox.btc354.com.error.log;
}
```

---

### 4. 日常 Git 一键更新部署发布流程

在更新代码后，在服务器终端依次执行以下命令：

```bash
# 1. 进入项目根目录并拉取最新 Git 代码
cd /www/wwwroot/inbox.btc354.com && git pull

# 2. 编译前端静态产物并同步至根目录
npm run build && cp -rf dist/* ./

# 3. 重启 PM2 后端进程
pm2 restart inbox-mate

# 4. 重载 Nginx 服务
sudo /etc/init.d/nginx reload
```

---

### 5. 运维诊断与健康检查命令

```bash
# 查看 PM2 进程状态
pm2 status inbox-mate

# 查看 PM2 实时日志
pm2 logs inbox-mate --lines 50

# 验证后端 API Health 状态
curl -sk https://inbox.btc354.com/api/v1/health

# 验证前端 HTTPS 连通性
curl -sk https://inbox.btc354.com/
```

---

## ⚙️ 邮箱服务商配置与使用要点

### 1. Microsoft 邮箱 (Outlook / Hotmail / Offilive / Live)
- **4段式 Graph 刷新令牌 (推荐)**：最稳定，直接使用 `邮箱----密码----客户端ID----刷新令牌` 导入即可，无需手动设置。
- **在线 OAuth 授权**：在侧边栏卡片点击 **【连接 Microsoft 账户】** 按钮，在打开的浏览器弹窗中登录完成微软官方授权。

### 2. Mail.ru 邮箱 (`@mail.ru`, `@inbox.ru` 等)
- 登录 Mail.ru 网页端，进入 `Security` (Безопасность) $\rightarrow$ `Passwords for external applications` (Пароли для внешних приложений)。
- 创建一个新的应用专用密码，在 Inbox Mate PRO 中输入 `邮箱----专用密码` 即可。

### 3. GMX 邮箱 (`@gmx.com` / `@gmx.de`)
- 登录 GMX 网页端，进入 `Settings` $\rightarrow$ `POP3 & IMAP`。
- 勾选开启 **Enable access to this account via POP3 and IMAP**，若开启了 2FA 请使用应用专用密码。

### 4. Rambler 邮箱 (`@rambler.ru`)
- 登录 Rambler 网页端，在设置中开启 IMAP 协议并生成专用密码。

---

## 📄 许可证

本项目采用 [MIT License](LICENSE) 许可证。
