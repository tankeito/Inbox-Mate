export interface AiServiceMatch {
  isOfficial: boolean;
  service: 'chatgpt' | 'claude' | null;
  label: string;
}

/**
 * 提取发件人真实邮箱地址（优先解析 <...> 内的真实地址）
 * 例: "Claude Team" <no-reply@email.claude.com> -> no-reply@email.claude.com
 */
export function extractSenderEmail(fromStr: string | null | undefined): string {
  if (!fromStr) return '';
  const trimmed = fromStr.trim();
  const angleMatch = trimmed.match(/<([^>]+)>/);
  if (angleMatch && angleMatch[1]) {
    return angleMatch[1].trim().toLowerCase();
  }
  const emailMatch = trimmed.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch && emailMatch[1]) {
    return emailMatch[1].trim().toLowerCase();
  }
  return trimmed.toLowerCase();
}

/**
 * 提取发件人邮箱域名
 * 例: no-reply@email.claude.com -> email.claude.com
 */
export function extractSenderDomain(fromStr: string | null | undefined): string {
  const email = extractSenderEmail(fromStr);
  const atIndex = email.lastIndexOf('@');
  return atIndex >= 0 ? email.slice(atIndex + 1).toLowerCase() : '';
}

// Claude / Anthropic 官方发件人域名白名单
const CLAUDE_DOMAINS = [
  'email.claude.com',
  'mail.anthropic.com',
  'anthropic.com',
  'claude.ai',
  'claude.com',
];

// ChatGPT / OpenAI 官方发件人域名白名单
const CHATGPT_DOMAINS = [
  'tm.openai.com',
  'openai.com',
  'chatgpt.com',
];

function isDomainMatch(senderDomain: string, validDomains: string[]): boolean {
  if (!senderDomain) return false;
  return validDomains.some((valid) => senderDomain === valid || senderDomain.endsWith('.' + valid));
}

/**
 * 校验是否为 Claude / Anthropic 官方邮件
 * 严格校验发件人真实域名，防止 "Claude Team" <fake@evil.com> 伪造显示名称
 */
export function isClaudeEmail(mail: { from?: string | null }): boolean {
  const domain = extractSenderDomain(mail?.from);
  return isDomainMatch(domain, CLAUDE_DOMAINS);
}

/**
 * 校验是否为 ChatGPT / OpenAI 官方邮件
 * 严格校验发件人真实域名，防止 "ChatGPT Support" <fake@evil.com> 伪造显示名称
 */
export function isChatGptEmail(mail: { from?: string | null }): boolean {
  const domain = extractSenderDomain(mail?.from);
  return isDomainMatch(domain, CHATGPT_DOMAINS);
}

/**
 * 校验是否为任一 AI 官方邮件 (ChatGPT 或 Claude)
 */
export function isAiOfficialEmail(mail: { from?: string | null }): boolean {
  return isClaudeEmail(mail) || isChatGptEmail(mail);
}

/**
 * 获取 AI 官方服务归属及 UI 显示标签
 */
export function getAiServiceMatch(mail: { from?: string | null }): AiServiceMatch {
  if (isChatGptEmail(mail)) {
    return { isOfficial: true, service: 'chatgpt', label: 'ChatGPT' };
  }
  if (isClaudeEmail(mail)) {
    return { isOfficial: true, service: 'claude', label: 'Claude' };
  }
  return { isOfficial: false, service: null, label: '' };
}

