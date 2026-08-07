import type { ProviderId } from './types.js';
import { normalizeEmail, providerForEmail } from '../server/providers.js';

export interface ParsedAccount {
  email: string;
  secret: string;
  provider: ProviderId;
  lineNumber: number;
}

export interface InvalidAccountLine {
  lineNumber: number;
  reason: 'empty_secret' | 'invalid_email' | 'unsupported_provider' | 'duplicate' | 'missing_separator';
}

export interface ParseAccountTextResult {
  accounts: ParsedAccount[];
  invalid: InvalidAccountLine[];
}

function splitLine(line: string): { email: string; secret: string } | undefined {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return undefined;

  for (const separator of ['----', '\t']) {
    const index = trimmed.indexOf(separator);
    if (index > 0) {
      return { email: trimmed.slice(0, index).trim(), secret: trimmed.slice(index + separator.length).trim() };
    }
  }
  const colon = trimmed.match(/^([^\s:]+@[^\s:]+)\s*:\s*(.*)$/);
  if (colon) return { email: colon[1].trim(), secret: colon[2].trim() };

  for (const separator of ['|', ',']) {
    const index = trimmed.indexOf(separator);
    if (index > 0) {
      return { email: trimmed.slice(0, index).trim(), secret: trimmed.slice(index + separator.length).trim() };
    }
  }
  return undefined;
}

export function parseAccountText(input: string, maxAccounts = 10): ParseAccountTextResult {
  const accounts: ParsedAccount[] = [];
  const invalid: InvalidAccountLine[] = [];
  const seen = new Set<string>();

  input.split(/\r?\n/).forEach((line, index) => {
    const lineNumber = index + 1;
    if (!line.trim() || line.trim().startsWith('#')) return;
    const parsed = splitLine(line);
    if (!parsed) {
      invalid.push({ lineNumber, reason: 'missing_separator' });
      return;
    }
    const email = normalizeEmail(parsed.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      invalid.push({ lineNumber, reason: 'invalid_email' });
      return;
    }
    if (!parsed.secret) {
      invalid.push({ lineNumber, reason: 'empty_secret' });
      return;
    }
    const provider = providerForEmail(email);
    if (!provider) {
      invalid.push({ lineNumber, reason: 'unsupported_provider' });
      return;
    }
    if (seen.has(email)) {
      invalid.push({ lineNumber, reason: 'duplicate' });
      return;
    }
    if (accounts.length >= maxAccounts) {
      invalid.push({ lineNumber, reason: 'duplicate' });
      return;
    }
    seen.add(email);
    accounts.push({ email, secret: parsed.secret, provider: provider.id, lineNumber });
  });

  return { accounts, invalid };
}
