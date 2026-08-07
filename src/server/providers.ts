import type { ProviderId } from '../shared/types.js';

export interface ProviderProfile {
  id: ProviderId;
  label: string;
  host: string;
  port: 993;
  domains: readonly string[];
  auth: 'oauth2' | 'app_password';
}

const MICROSOFT_DOMAINS = [
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'outlook.de',
  'outlook.jp',
  'outlook.co.uk',
  'hotmail.co.uk',
  'hotmail.de'
] as const;

const GMX_DOMAINS = ['gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.ch', 'gmx.fr', 'gmx.co.uk', 'gmx.us', 'gmx.info'] as const;
const RAMBLER_DOMAINS = ['rambler.ru', 'myrambler.ru', 'ro.ru', 'lenta.ru', 'autorambler.ru'] as const;

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderProfile> = {
  microsoft: {
    id: 'microsoft',
    label: 'Microsoft',
    host: 'outlook.office365.com',
    port: 993,
    domains: MICROSOFT_DOMAINS,
    auth: 'oauth2'
  },
  gmx: {
    id: 'gmx',
    label: 'GMX',
    host: 'imap.gmx.com',
    port: 993,
    domains: GMX_DOMAINS,
    auth: 'app_password'
  },
  rambler: {
    id: 'rambler',
    label: 'Rambler',
    host: 'imap.rambler.ru',
    port: 993,
    domains: RAMBLER_DOMAINS,
    auth: 'app_password'
  }
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function domainFromEmail(email: string): string | undefined {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf('@');
  if (at <= 0 || at === normalized.length - 1) return undefined;
  return normalized.slice(at + 1);
}

export function providerForEmail(email: string): ProviderProfile | undefined {
  const domain = domainFromEmail(email);
  if (!domain) return undefined;
  return Object.values(PROVIDER_REGISTRY).find((provider) => provider.domains.includes(domain));
}

export function maskEmail(email: string): string {
  const [local, domain] = normalizeEmail(email).split('@');
  if (!local || !domain) return '已隐藏邮箱';
  const prefix = local.length === 1 ? local : `${local.slice(0, 2)}${'•'.repeat(Math.min(4, Math.max(1, local.length - 2)))}`;
  return `${prefix}@${domain}`;
}
