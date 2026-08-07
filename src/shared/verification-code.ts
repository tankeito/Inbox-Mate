import type { CodeMatch } from './types.js';

type Source = 'subject' | 'body';

interface Candidate {
  value: string;
  index: number;
  source: Source;
}

const KEYWORD = /(?:verification\s*(?:code|number)?|verify|one[-\s]?time\s*(?:passcode|code|password)?|otp|passcode|security\s*code|\bcode\b|验证码|校验码|确认码|动态口令|验证代码|登入码|安全码)/gi;
const NEGATIVE = /(?:order|invoice|tracking|reference|phone|zip|postal|date|expired|过期|订单|物流|金额|发票|手机号|日期|copyright|all\s*rights\s*reserved)/i;
const URL_NEARBY = /https?:\/\/|www\./i;
const TOKEN = /(?<![A-Za-z0-9])([A-Za-z0-9]{4,8})(?![A-Za-z0-9])/g;

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function collectCandidates(text: string, source: Source): Candidate[] {
  const candidates: Candidate[] = [];
  for (const match of text.matchAll(TOKEN)) {
    const value = match[1];
    if (!value || !/\d/.test(value)) continue;
    candidates.push({ value: value.toUpperCase(), index: match.index ?? 0, source });
  }
  return candidates;
}

function nearestKeywordDistance(text: string, index: number): number | undefined {
  let nearest: number | undefined;
  for (const keyword of text.matchAll(KEYWORD)) {
    const keywordIndex = keyword.index ?? 0;
    const distance = Math.abs(keywordIndex - index);
    if (nearest === undefined || distance < nearest) nearest = distance;
  }
  return nearest;
}

function scoreCandidate(candidate: Candidate, text: string): { score: number; reasons: string[] } {
  const value = candidate.value;
  const local = text.slice(Math.max(0, candidate.index - 48), candidate.index + value.length + 48);
  const distance = nearestKeywordDistance(text, candidate.index);
  let score = 0;
  const reasons: string[] = [];

  if (/^\d{4,8}$/.test(value)) {
    score += 26;
    reasons.push('numeric_code');
  } else if (/^[A-Z0-9]{4,8}$/.test(value) && /[A-Z]/.test(value)) {
    score += 18;
    reasons.push('alphanumeric_code');
  }
  if (value.length === 6 && /^\d+$/.test(value)) {
    score += 12;
    reasons.push('six_digits');
  }
  if (candidate.source === 'subject') {
    score += 22;
    reasons.push('subject_candidate');
  }
  if (distance !== undefined && distance <= 48) {
    score += Math.max(15, 48 - distance);
    reasons.push(candidate.source === 'subject' ? 'subject_keyword' : 'nearby_keyword');
  }
  if (new RegExp(`(?:code|otp|验证码|校验码|安全码)\\s*[:：是为-]?\\s*${value}`, 'i').test(local)) {
    score += 18;
    reasons.push('labelled_value');
  }

  const hasKeyword = reasons.includes('nearby_keyword') || reasons.includes('subject_keyword') || reasons.includes('labelled_value');

  if (NEGATIVE.test(local)) {
    score -= 35;
    reasons.push('negative_context');
  }
  if (URL_NEARBY.test(local)) {
    score -= 24;
    reasons.push('url_context');
  }
  if (/^\d{4}[-/]\d{1,2}/.test(local) || /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(local)) {
    score -= 18;
    reasons.push('date_context');
  }

  // Without explicit OTP keyword, cap the score so random numbers in welcome/notification emails are not misidentified as codes
  if (!hasKeyword && candidate.source !== 'subject') {
    score = Math.min(score, 30);
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

export function extractVerificationCode(input: {
  subject?: string | null;
  text?: string | null;
  receivedAt: Date | string;
  from?: string | null;
}): CodeMatch | undefined {
  const subject = normalizeText(input.subject ?? '');
  const body = normalizeText(input.text ?? '');
  const candidates = [...collectCandidates(subject, 'subject'), ...collectCandidates(body, 'body')];
  const byValue = new Map<string, { candidate: Candidate; score: number; reasons: string[] }>();

  for (const candidate of candidates) {
    const text = candidate.source === 'subject' ? subject : body;
    const scored = scoreCandidate(candidate, text);
    const previous = byValue.get(candidate.value);
    if (!previous || scored.score > previous.score) {
      byValue.set(candidate.value, { candidate, ...scored });
    }
  }

  const best = [...byValue.values()].sort((left, right) => right.score - left.score)[0];
  if (!best || best.score < 45) return undefined;

  return {
    code: best.candidate.value,
    confidence: best.score >= 75 ? 'high' : best.score >= 50 ? 'medium' : 'low',
    score: best.score,
    receivedAt: new Date(input.receivedAt).toISOString(),
    subject: subject.slice(0, 180) || undefined,
    from: normalizeText(input.from ?? '').slice(0, 160) || undefined,
    reason: (best.reasons || []).filter((reason) => !reason.startsWith('negative')).slice(0, 4)
  };
}
