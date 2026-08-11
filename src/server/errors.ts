import type { AccountError, SafeErrorCode } from '../shared/types.js';

const ERROR_MESSAGES: Record<SafeErrorCode, string> = {
  BAD_REQUEST: '请求参数无效。',
  UNSUPPORTED_PROVIDER: '该邮箱域名不在本机支持列表中。',
  AUTH_REQUIRED: '需要完成邮箱授权后才能继续。',
  AUTH_DENIED: '邮箱授权被拒绝或已取消。',
  AUTH_EXPIRED: '邮箱授权已过期，请重新授权。',
  AUTH_FAILED: '邮箱认证失败。请检查应用密码或重新授权。',
  MAILCOM_IMAP_DISABLED: 'Mail.com 账号认证失败：官方限制免费账号第三方 IMAP/POP3 访问，系统已自动转入网页模拟登录驱动。',
  CAPTCHA_TRIGGERED: 'Mail.com 触发人机安全验证，请先在浏览器手动登录解封。',
  PROXY_BLOCKED: '访问 Mail.com 被网络阻断或 IP 受限，请检查代理网络环境。',
  CONNECTION_FAILED: '无法连接到邮箱服务器。',
  TIMEOUT: '连接邮箱超时，请稍后重试。',
  RATE_LIMITED: '当前任务过多，请等待正在运行的任务结束。',
  NO_MATCH: '最近邮件中没有找到可信的验证码。',
  CANCELLED: '任务已取消。',
  INTERNAL: '处理邮件时发生了内部错误。'
};

export class InboxMateError extends Error {
  public readonly customMessage?: string;

  constructor(
    public readonly code: SafeErrorCode,
    public readonly status = 400,
    customMessage?: string
  ) {
    super(customMessage ?? ERROR_MESSAGES[code]);
    this.name = 'InboxMateError';
    this.customMessage = customMessage;
  }
}

export function safeError(code: SafeErrorCode, customMessage?: string): AccountError {
  return { code, message: customMessage ?? ERROR_MESSAGES[code] };
}

export function isInboxMateError(value: unknown): value is InboxMateError {
  return value instanceof InboxMateError;
}

export function classifyImapError(error: unknown, wasAborted: boolean): SafeErrorCode {
  if (wasAborted) return 'CANCELLED';

  const candidate = error as { name?: string; code?: string; authenticationFailed?: boolean };
  const name = `${candidate?.name ?? ''}`.toLowerCase();
  const code = `${candidate?.code ?? ''}`.toLowerCase();

  if (candidate?.authenticationFailed || name.includes('authentication') || code.includes('auth')) {
    return 'AUTH_FAILED';
  }
  if (code.includes('timeout') || code === 'etimedout' || code === 'esockettimeout') {
    return 'TIMEOUT';
  }
  if (code.includes('abort') || name.includes('abort')) {
    return 'CANCELLED';
  }
  return 'CONNECTION_FAILED';
}
