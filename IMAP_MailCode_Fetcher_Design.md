# Inbox Mate 本机验证码读取器 MVP 设计

## 1. 目标与边界

Inbox Mate 是运行在用户自己电脑上的单用户 Web 工具。用户临时授权自己的邮箱后，工具从最近邮件中找出可能的登录/验证代码，并在本机界面展示结果。

### MVP 范围

- 本机 Dashboard 与本机 Node.js 服务配套运行，服务只监听 `127.0.0.1`。
- 支持 Microsoft 个人邮箱（Outlook/Hotmail/Live）的 OAuth 2.0 + PKCE + IMAP XOAUTH2。
- 支持 GMX、Rambler 的 IMAP TLS + 应用专用密码；用户需自行在邮箱设置中启用 IMAP 并创建应用密码。
- 一次任务最多处理 10 个账户，读取 `INBOX` 最近时间窗内、最多 20 封候选邮件。
- 解析邮件主题和正文文本，返回代码、置信度、邮件最小元数据和标准化错误状态。
- 任务执行中通过 SSE 逐账户推送状态；用户可取消任务、手动复制结果。

### 非目标

- 不做公网部署、多用户、团队共享、账户托管或后台长期轮询。
- 不支持任意 IMAP 主机、端口或用户自定义服务器发现；MVP 不支持企业 Microsoft 自定义域名。
- 不同步全量邮件、不保存邮件历史、不展示完整原文、不下载附件、不发送邮件。
- 不绕过 MFA、验证码、人机验证或服务商的访问限制；不处理非用户本人拥有或明确获授权的邮箱。
- 不以“批量账号”或自动化滥用为用途。

### 授权边界

用户只能连接其本人拥有或已获得明确授权的邮箱。Microsoft 授权页必须由该账户所有者完成，用户可以在 Microsoft 账户中撤销授权。GMX/Rambler 只接受应用专用密码，不鼓励或要求输入日常登录密码。应用在 UI、日志和 API 错误中不回显秘密信息。

## 2. 本地架构与安全模型

```text
浏览器 Dashboard (http://127.0.0.1:<port>)
       | 同源 HTTP / SSE，Cache-Control: no-store
       v
Node.js 本机服务
  - ProviderRegistry / OAuth 会话
  - JobManager / 限流 / SSE 事件缓存
  - IMAP Provider Adapter / MIME 解析 / 代码评分
       | 仅固定的 TLS IMAP 端点
       v
Microsoft / GMX / Rambler
```

- 后端默认绑定 `127.0.0.1`，不得绑定 `0.0.0.0`、`::` 或局域网地址；生产式启动时显式校验监听地址。
- 前端静态资源和 API 同源提供。CORS 默认关闭；校验 `Origin`/`Host`，写请求使用 SameSite=Strict 的本机会话 Cookie 加 CSRF token。
- `ProviderRegistry` 是服务器端常量。客户端只能传 `provider`，不能传 `imapHost`、端口、TLS 选项、代理或重定向地址，因此没有通向任意内网地址的 SSRF 路径。
- IMAP 一律使用 TLS（993、`secure: true`、证书校验开启）。不得接受自签名证书、忽略证书错误或降级到明文 IMAP。
- OAuth 回调固定为本机回调地址；使用 `state`、PKCE (`S256`) 和一次性、短时有效的授权会话。access token/refresh token 仅在进程内存中存活，任务完成、取消、超时或进程退出后清除。
- 本机监听并不能防御拥有同等本机权限的恶意程序；该风险在 MVP 中明确为宿主机信任边界，不将服务暴露给其他设备。

## 3. 服务商与认证矩阵

| provider | 允许邮箱域名 | IMAP 端点 | 认证方式 | MVP 约束 |
| --- | --- | --- | --- | --- |
| `microsoft` | 配置表中精确列出的 `outlook.com`、`hotmail.com`、`live.com`、`msn.com` 等个人域名 | `outlook.office365.com:993` | OAuth 2.0 Authorization Code + PKCE，IMAP XOAUTH2 | 申请最小的 IMAP 委派权限；仅内存保存令牌；不使用用户名/密码 Basic Auth。 |
| `gmx` | 配置表中精确列出的 GMX 域名 | `imap.gmx.com:993` | IMAP 应用专用密码 | 用户先启用 POP3/IMAP；密码只用于当前任务。 |
| `rambler` | 配置表中精确列出的 Rambler 域名 | `imap.rambler.ru:993` | IMAP 应用专用密码 | 用户先启用 IMAP/创建应用密码；密码只用于当前任务。 |

域名映射必须精确匹配受支持域名或其明确列出的子域名，不能用 `includes('outlook')` 之类的模糊判断。未知域名返回 `UNSUPPORTED_PROVIDER`。服务商政策和 OAuth scope 以实现时的官方文档为准，并用集成测试验证端点与认证流程。

## 4. 数据模型与状态机

所有模型仅驻留内存。`secret`、OAuth token、完整正文和原始 MIME 源不进入任务结果、SSE 事件、日志或持久化存储。

```ts
type JobState = 'queued' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
type AccountState =
  | 'pending' | 'authenticating' | 'connecting' | 'searching'
  | 'parsing' | 'completed' | 'failed' | 'cancelled';

type AccountInput = {
  clientAccountId: string;       // 客户端生成 UUID，用于 UI 对应
  email: string;
  provider: 'microsoft' | 'gmx' | 'rambler';
  auth:
    | { type: 'oauth_session'; sessionId: string }
    | { type: 'app_password'; secret: string };
};

type CodeMatch = {
  code: string;
  confidence: 'high' | 'medium' | 'low';
  score: number;                 // 0..100，供 UI 排序，不宣称统计概率
  receivedAt: string;
  subject?: string;              // 截断且转义后展示
  from?: string;
  reason: string[];              // 如 ['subject_keyword', 'nearby_keyword', 'six_digits']
};
```

任务状态流转为 `queued -> running -> (completed | failed | cancelled)`；取消请求先进入 `cancelling`，待正在执行的账户清理连接后进入 `cancelled`。账户状态流转为 `pending -> authenticating -> connecting -> searching -> parsing -> completed`，任一步可进入 `failed` 或 `cancelled`。JobManager 保留结果和 SSE 重放事件 10 分钟，之后彻底销毁。

## 5. API 与 SSE 契约

所有 API 路径以 `/api/v1` 开头，响应使用 JSON，设置 `Cache-Control: no-store`。请求体限制为 64 KiB；账户数为 1--10；`lookbackMinutes` 为 5--120（默认 30）；`maxMessagesPerAccount` 为 1--20（默认 15）。校验失败只返回稳定错误码和可安全展示的说明。

### OAuth

```http
POST /api/v1/oauth/microsoft/start
{ "clientAccountId": "uuid", "email": "name@outlook.com" }

200 { "authorizationUrl": "https://...", "expiresAt": "..." }
```

浏览器在用户手势下打开 `authorizationUrl`。回调成功后由前端轮询 `GET /api/v1/oauth/microsoft/status?clientAccountId=...`，获得一次性 `sessionId`；该值只可用于该邮箱的一次任务，默认 10 分钟过期。回调失败或过期时返回 `AUTH_REQUIRED`、`AUTH_DENIED` 或 `AUTH_EXPIRED`，不返回上游原始错误。

### 创建、查询和取消任务

```http
POST /api/v1/jobs
{
  "lookbackMinutes": 30,
  "maxMessagesPerAccount": 15,
  "accounts": [
    { "clientAccountId": "uuid-1", "email": "a@gmx.com", "provider": "gmx",
      "auth": { "type": "app_password", "secret": "transient-secret" } },
    { "clientAccountId": "uuid-2", "email": "b@outlook.com", "provider": "microsoft",
      "auth": { "type": "oauth_session", "sessionId": "one-time-id" } }
  ]
}

202 { "jobId": "unguessable-id", "state": "queued" }

GET    /api/v1/jobs/{jobId}
DELETE /api/v1/jobs/{jobId}       // 202 { "state": "cancelling" }
```

`jobId` 使用至少 128 位不可预测随机值。查询结果只包含账户状态、脱敏/必要的邮箱标识、代码匹配和安全错误码，不包含 `auth`、token、原始正文或 MIME。

### SSE

```http
GET /api/v1/jobs/{jobId}/events
Accept: text/event-stream
Last-Event-ID: <optional>
```

服务端按事件 ID 保留 10 分钟事件，支持断线后用 `Last-Event-ID` 重放。事件类型如下：

```text
event: job.snapshot
data: { jobId, state, accounts: [...] }

event: account.updated
data: { jobId, clientAccountId, state, result?, error? }

event: job.completed
data: { jobId, state: 'completed' | 'failed' | 'cancelled', summary }
```

SSE 每 15 秒发送注释心跳；客户端断线不取消任务。UI 以 `account.updated` 独立更新各账户，最终以 `job.completed` 收束。错误码固定为 `BAD_REQUEST`、`UNSUPPORTED_PROVIDER`、`AUTH_REQUIRED`、`AUTH_DENIED`、`AUTH_FAILED`、`CONNECTION_FAILED`、`TIMEOUT`、`RATE_LIMITED`、`NO_MATCH`、`CANCELLED`、`INTERNAL`。

## 6. 邮件读取与验证码提取

1. 只打开 `INBOX`，按 `INTERNALDATE`/UID 从新到旧查找最近时间窗的候选邮件，最多取 `maxMessagesPerAccount` 封。不得把“最新 N 封”误当成“当前验证码”。
2. 先取 envelope 与有限头部；仅在候选邮件上取得受大小上限保护的正文源。单封原始消息超过 1 MiB 时跳过并记录安全错误，不取附件。
3. 使用成熟 MIME 解析库处理 multipart、charset、base64 和 quoted-printable。仅使用解码后的主题、`text/plain` 和经清洗转换的 HTML 文本；不渲染 HTML、不加载远程资源。
4. 收集所有 4--8 位数字和符合服务常见格式的短字母数字候选值，去重后评分。关键词必须与候选值在有限距离内匹配，不能把 `Code` 或 `Verification` 词本身当成代码。
5. 评分应是可解释的确定性规则：主题中相邻的验证关键词、正文中相邻关键词、六码数字格式和更近的收件时间加分；URL、订单号、日期、追踪号、过期提示等负面上下文扣分。`score >= 75` 为 `high`，50--74 为 `medium`，其余为 `low`。
6. 默认返回最高分候选值及原因。低置信度结果显著标记，UI 不自动复制；所有复制均由用户显式点击触发。若无合格候选值，账户为 `completed` 且结果为 `NO_MATCH`，不是任务失败。

该算法不需要 AI。后续规则变更必须先用脱敏的真实邮件样本集评估准确率，不能仅靠单条正则示例判断。

## 7. 并发、超时与资源管理

- 同时只允许一个活跃 Job；全局 IMAP 并发上限为 3，每个 provider 上限为 2。其余账户排队，避免触发服务商风控或耗尽本机连接。
- 连接超时 10 秒、认证超时 15 秒、单账户总超时 30 秒、单任务总超时 2 分钟。超时或取消必须中止读取并安全关闭连接。
- 使用 `try/finally` 保证邮箱锁释放、`logout()`/`close()` 执行。即使邮箱为空、MIME 解析失败、SSE 客户端断开或抛出异常，也不得泄漏 IMAP 连接。
- 认证失败不自动重试，防止锁定账户；仅对明确的瞬时网络失败重试一次，且受单账户总超时约束。
- OAuth 会话、应用密码、AbortController 和结果缓存均由 Job 生命周期统一清理。任务完成后立即清除凭据引用，缓存到期后删除结果和事件。

## 8. 隐私与可观测性

- 不写数据库、文件、浏览器 `localStorage`、`sessionStorage` 或持久化密钥链；刷新页面不恢复账户或结果。
- 密码输入框关闭自动填充；请求、响应、SSE 与 OAuth 回调均设 `Cache-Control: no-store`。代码只在当前 UI 和短时内存任务结果中存在。
- 结构化日志只记录请求 ID、provider、状态码、耗时和计数；不得记录邮箱地址、密码、token、验证码、主题、发件人、正文、原始 IMAP 响应或完整上游错误。
- 错误对用户显示标准化状态，对开发诊断使用无敏感信息的内部错误类别。禁止将 `err.message` 原样返回。
- 前端对展示的主题和发件人做 HTML 转义与长度截断；使用严格 CSP，禁止第三方脚本与远程资源。

JavaScript 不能保证字符串在内存中物理擦除，因此“清除”指删除应用层引用、缩短存活时间并禁止持久化和日志记录。

## 9. 测试策略与验收指标

### 自动化测试

- 单元测试：provider 精确域名映射、输入范围校验、OAuth state/PKCE、错误码映射、候选提取与排序。
- 提取样本：`Your verification code: 849201`、`verification code is 4920`、多候选邮件、订单号/日期/URL 干扰、过期码、中文和非 UTF-8 文本；验证不会返回关键词本身。
- MIME 测试：multipart、HTML、base64、quoted-printable、不同 charset、超大邮件和含附件邮件。
- 集成测试：mock IMAP/OAuth 覆盖空邮箱、认证失败、TLS/连接异常、超时、取消、连接在所有异常路径释放、SSE 重连重放。
- 安全测试：请求中的 `imapHost`、端口、代理字段必须被拒绝；未知域名不可连接；日志测试断言 secret/token/code/body 永不出现；监听地址只能是 loopback。
- 端到端测试：创建 OAuth/应用密码账户、逐账户进度、低置信度不自动复制、取消任务、断线恢复和页面刷新后无敏感状态残留。

### MVP 验收

1. 服务在默认配置下只能从 `127.0.0.1` 访问，且不会接受客户端指定的网络目标。
2. Microsoft 账户通过 OAuth2/XOAUTH2 成功读取，不依赖 Basic Auth；GMX/Rambler 使用应用专用密码。
3. 10 个账户任务中实际并发 IMAP 连接数从不超过 3，任何账户失败不阻断其他账户结果。
4. 空邮箱和任意异常路径后不存在未关闭的 IMAP 连接或邮箱锁。
5. 样本集中上述两种常见验证码文本均正确提取数字代码，不将 `Code`/`Verification` 作为结果；低置信度结果不自动复制。
6. 日志、浏览器持久化存储和 10 分钟后任务缓存均不含凭据、token、正文或验证码。
7. UI 在每个账户完成时收到独立状态更新，并在结束、取消、超时和断线重连时显示一致结果。

## 10. 实施顺序

1. 建立本机服务与 Dashboard 骨架、ProviderRegistry、输入校验、JobManager、SSE 和测试基础设施。
2. 实现 Microsoft OAuth2/PKCE/XOAUTH2 与 GMX/Rambler 应用密码 adapter，并完成超时、限流、取消和资源清理。
3. 接入受限 IMAP 读取、MIME 解析、可解释代码评分器和脱敏结果模型。
4. 完成 Dashboard 的授权、批量任务、逐账户状态、手动复制和错误展示。
5. 补齐 mock 集成测试、端到端测试与隐私/安全回归测试，再用真实且已脱敏的授权邮件样本校准规则。
