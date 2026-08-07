# Inbox Mate - 专业级多账户邮件读取与验证码提取助手

<p align="center">
  <strong>Inbox Mate</strong> 是一款纯本地运行 (Local-Only)、轻量高能的多账户邮件读取与验证码智能提取工具。<br/>
  专为需要高效并发检索多个邮箱账户邮件内容与验证码的用户设计，隐私安全，凭据不落盘。
</p>

---

## ✨ 核心特性

- 🚀 **50+ 邮箱并发处理**：突破传统客户端限制，单次任务支持同时对多达 50 个邮箱账户进行并发 IMAP 读取。
- 🔒 **纯本地内存沙盒 (Local-Only Sandbox)**：
  - 100% 内存即时处理，不使用任何持久化数据库。
  - 账号密码与 OAuth 凭据随用随清，关闭浏览器或终止程序即刻抹除。
  - 严格绑定 `127.0.0.1` 本地回环接口，搭配 SameSite CSRF 令牌，防止跨站网络攻击。
- 🎨 **双套主题与全端响应式**：
  - 支持 **跟随系统 💻**、**亮色模式 ☀️**（纯白清爽）、**暗色模式 🌙**（深色极客）一键切换。
  - 完美适配 PC 桌面大屏（无垂直滚动条视口设计）与 📱 手机移动端自适应。
- 🤖 **智能验证码提炼**：
  - 多重模式匹配算法，自动从邮件正文中高置信度提炼 4-8 位验证码。
  - 独创验证码高亮置信度卡片，支持一键复制与震动反馈 (`navigator.vibrate`)。
- 🌐 **多服务商自动识别与握手**：
  - **GMX 邮箱** (`@gmx.com`, `@gmx.de` 等) $\rightarrow$ IMAP TLS 直连。
  - **Rambler 邮箱** (`@rambler.ru`, `@lenta.ru` 等) $\rightarrow$ IMAP TLS 直连。
  - **Microsoft 邮箱** (`@outlook.com`, `@hotmail.com` 等) $\rightarrow$ 支持 OAuth 2.0 PKCE 授权与 XOAUTH2 安全握手。

---

## 🛠️ 本地环境准备与启动指南

### 前提条件
- **Node.js**: `>= 20.0.0`
- **Package Manager**: `npm` 或 `pnpm` / `yarn`

---

### 1. 快速开发模式 (Development Mode)

适用于代码修改与实时预览：

```bash
# 1. 克隆项目仓库
git clone https://github.com/your-username/Inbox-Mate.git
cd Inbox-Mate

# 2. 安装依赖
npm install

# 3. 启动开发服务器 (同时启动 Vite 前端与 Node 后端)
npm run dev
```

启动成功后：
- 前端 WebUI 访问地址：`http://127.0.0.1:5173`
- 后端 API 服务地址：`http://127.0.0.1:3000`（Vite 已自动处理跨域代理）

---

### 2. 本地生产构建模式 (Production Mode)

适用于正式构建并本地稳定运行：

```bash
# 1. 编译 TypeScript 与 Vite 前端资源
npm run build

# 2. 启动生产模式本地服务器
npm start
```

启动成功后，直接在浏览器中访问：
👉 **`http://127.0.0.1:3000`**

---

### 3. 运行单元测试 (Unit Tests)

```bash
npm test
```

包含验证码提取算法、账号解析器、Zod 入参校验与并发 Job 管理器全量测试。

---

## 📋 批量导入格式说明

在左侧【**批量导入**】Tab 中，支持复制粘贴多行邮箱凭据，自动智能解析以下常见分隔符：

```text
# 格式 1：四个短横线分隔 (推荐)
user1@gmx.com----应用专用密码
user2@gmx.de----应用专用密码

# 格式 2：英文冒号或竖线分隔
user3@rambler.ru:应用专用密码
user4@rambler.ru|应用专用密码

# 格式 3：仅邮箱 (适用于微软 OAuth 授权邮箱)
user5@outlook.com
user6@hotmail.com
```

---

## ⚙️ 邮箱服务商设置指南

### 1. GMX 邮箱 (`@gmx.com` / `@gmx.de`)
1. 登录 GMX 网页端，进入 `Settings` $\rightarrow$ `POP3 & IMAP`。
2. 勾选 **Enable access to this account via POP3 and IMAP**。
3. 如果开启了双重验证 (2FA)，请生成并使用 **应用专用密码 (App Password)**。

### 2. Rambler 邮箱 (`@rambler.ru`)
1. 登录 Rambler 邮箱网页版，进入设置。
2. 开启 IMAP 协议支持并生成应用专用密码。

### 3. Microsoft 邮箱 (Outlook / Hotmail / Live)
1. 微软个人邮箱已于 2024 年全量关闭普通密码直连，需通过 OAuth 2.0 授权。
2. 可选配置：复制 `.env.example` 为 `.env`，设置您的 `MICROSOFT_CLIENT_ID`。
3. 微软重定向 URI 设置为：`http://127.0.0.1:3000/api/v1/oauth/microsoft/callback`。
4. 在页面卡片中点击 **【连接 Microsoft 账户】** 即可调起官方一键授权。

---

## 🔒 隐私与安全边界

- **非托管服务**：本软件为 100% 单机运行工具，无中央服务器，不收集任何用户隐私数据。
- **无持久化存储**：不使用 MySQL / MongoDB / SQLite / Redis，关闭程序或浏览器刷新即抹除所有临时数据。
- **请勿外网暴露**：请勿将本程序暴露到公网、局域网或反向代理中，仅限本机信任用户使用。

---

## 📄 开源许可证

[MIT License](LICENSE)
