import type { EngineType, ProviderId } from '../shared/types.js';

export interface ProviderProfile {
  id: ProviderId;
  label: string;
  host: string;
  port: number;
  domains: readonly string[];
  auth: 'oauth2' | 'app_password';
  engineType: EngineType;
}

const MICROSOFT_DOMAINS = [
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'offilive.com',
  'outlook.de',
  'outlook.jp',
  'outlook.co.uk',
  'hotmail.co.uk',
  'hotmail.de'
] as const;

const GMX_DOMAINS = ['gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.ch', 'gmx.fr', 'gmx.co.uk', 'gmx.us', 'gmx.info'] as const;
const RAMBLER_DOMAINS = ['rambler.ru', 'myrambler.ru', 'ro.ru', 'lenta.ru', 'autorambler.ru'] as const;
const MAILRU_DOMAINS = ['mail.ru', 'inbox.ru', 'list.ru', 'bk.ru', 'internet.ru'] as const;

export const MAILCOM_DOMAINS = [
  'mail.com',
  'email.com',
  'usa.com',
  'myself.com',
  'post.com',
  'consultant.com',
  'dr.com',
  'engineer.com',
  'techie.com',
  'writeme.com',
  'cheerful.com',
  'catlover.com',
  'doglover.com',
  'solution4u.com',
  'iname.com',
  'alumni.com',
  'columnist.com',
  'deliveryman.com',
  'diplomats.com',
  'instruction.com',
  'accountant.com',
  'monarchy.com',
  'realtyagent.com',
  'registerednurses.com',
  'repairman.com',
  'representative.com',
  'sanfranmail.com',
  'sociologist.com',
  'teachers.org',
  'technologist.com',
  'uniforms.com',
  'worker.com',
  'workmail.com',
  'elvis.com',
  'optician.com',
  'pediatrician.com',
  'presidency.com',
  'crew22.net',
  'actuary.net',
  'adexec.com',
  'allergist.com',
  'alumnidirector.com',
  'ambulance.net',
  'appraiser.net',
  'archaeologist.com',
  'architect.com',
  'artlover.com',
  'auctioneer.net',
  'bartender.net',
  'bellair.net',
  'bikerider.com',
  'birdlover.com',
  'boatlover.com',
  'brewer.com',
  'brewmeister.com',
  'cameraman.net',
  'caregiver.com',
  'cashier.com',
  'chef.net',
  'chemist.com',
  'clerk.com',
  'collector.org',
  'comic.com',
  'computer4u.com',
  'contractor.net',
  'counsellor.com',
  'count.com',
  'couple.com',
  'cricketer.com',
  'customsagent.com',
  'cyberdude.com',
  'cybergal.com',
  'cyber-wizard.com',
  'disposable.com',
  'doctor.com',
  'execs.com',
  'financier.com',
  'fireman.net',
  'gardener.net',
  'geologist.com',
  'graphic-designer.com',
  'hairdresser.net',
  'homemail.com',
  'humanoid.net',
  'hypnotherapist.net',
  'instructor.net',
  'insurer.com',
  'journalist.com',
  'lawyer.com',
  'legislator.com',
  'lobbyist.com',
  'mad.scientist.com',
  'minister.com',
  'musician.org',
  'nightly.com',
  'nonpartisan.com',
  'northeast.com',
  'nurse.net',
  'officemail.com',
  'orthodontist.net',
  'physicist.net',
  'politician.com',
  'popstar.com',
  'priest.com',
  'programmer.net',
  'publicist.com',
  'radiologist.net',
  'reggae.com',
  'reiki.com',
  'rescueteam.com',
  'salesperson.net',
  'scientist.com',
  'secretary.net',
  'socialworker.net',
  'songwriter.net',
  'specialist.com',
  'surfer.com',
  'surgical.net',
  'sweetheart.com',
  'toothfairy.com',
  'tvstar.com',
  'umpire.com',
  'usatodaymail.com',
  'writer.com',
  'yours.com',
  'californiamail.com',
  'dallasmail.com',
  'nycmail.com',
  'boston.com',
  'alaska.com',
  'arizona.com',
  'floridamail.com',
  'texas.com',
  'europe.com',
  'asia.com',
  'africa.com',
  'australiamail.com',
  'japan.com',
  'berlin.com',
  'london.com',
  'madrid.com',
  'rome.com',
  'paris.com',
  'singapore.com',
  'tokyo.com',
  'dublin.com',
  'germanymail.com',
  'loveable.com',
  'madonna.com',
  'ninja.com',
  'orthodox.com',
  'poetic.com',
  'proud.com',
  'rare.com',
  'saintly.com',
  'sinful.com',
  'starmail.com',
  'whoever.com',
  'winning.com',
  'witty.com'
] as const;

const YAHOO_DOMAINS = ['yahoo.com', 'yahoo.co.uk', 'yahoo.de', 'yahoo.fr', 'myyahoo.com', 'ymail.com'] as const;
const GMAIL_DOMAINS = ['gmail.com', 'googlemail.com'] as const;
const NETEASE_DOMAINS = ['163.com', '126.com', 'yeah.net'] as const;
const QQ_DOMAINS = ['qq.com', 'foxmail.com'] as const;
const ICLOUD_DOMAINS = ['icloud.com', 'me.com', 'mac.com'] as const;
const ZOHO_DOMAINS = ['zoho.com', 'zohomail.com'] as const;
const FASTMAIL_DOMAINS = ['fastmail.com', 'fastmail.fm'] as const;
const AOL_DOMAINS = ['aol.com'] as const;

export const PROVIDER_REGISTRY: Record<ProviderId, ProviderProfile> = {
  microsoft: {
    id: 'microsoft',
    label: 'Microsoft',
    host: 'outlook.office365.com',
    port: 993,
    domains: MICROSOFT_DOMAINS,
    auth: 'oauth2',
    engineType: 'microsoft_graph'
  },
  gmx: {
    id: 'gmx',
    label: 'GMX',
    host: 'imap.gmx.com',
    port: 993,
    domains: GMX_DOMAINS,
    auth: 'app_password',
    engineType: 'imap_pop3'
  },
  rambler: {
    id: 'rambler',
    label: 'Rambler',
    host: 'imap.rambler.ru',
    port: 993,
    domains: RAMBLER_DOMAINS,
    auth: 'app_password',
    engineType: 'imap_pop3'
  },
  mailru: {
    id: 'mailru',
    label: 'Mail.ru',
    host: 'imap.mail.ru',
    port: 993,
    domains: MAILRU_DOMAINS,
    auth: 'app_password',
    engineType: 'imap_pop3'
  },
  mailcom: {
    id: 'mailcom',
    label: 'Mail.com',
    host: 'imap.mail.com',
    port: 993,
    domains: MAILCOM_DOMAINS,
    auth: 'app_password',
    engineType: 'web_rpa'
  },
  yahoo: {
    id: 'yahoo',
    label: 'Yahoo',
    host: 'imap.mail.yahoo.com',
    port: 993,
    domains: YAHOO_DOMAINS,
    auth: 'app_password',
    engineType: 'imap_pop3'
  },
  gmail: {
    id: 'gmail',
    label: 'Gmail',
    host: 'imap.gmail.com',
    port: 993,
    domains: GMAIL_DOMAINS,
    auth: 'app_password',
    engineType: 'imap_pop3'
  },
  netease163: {
    id: 'netease163',
    label: '网易邮箱',
    host: 'imap.163.com',
    port: 993,
    domains: NETEASE_DOMAINS,
    auth: 'app_password',
    engineType: 'imap_pop3'
  },
  qq: {
    id: 'qq',
    label: 'QQ邮箱',
    host: 'imap.qq.com',
    port: 993,
    domains: QQ_DOMAINS,
    auth: 'app_password',
    engineType: 'imap_pop3'
  },
  icloud: {
    id: 'icloud',
    label: 'iCloud',
    host: 'imap.mail.me.com',
    port: 993,
    domains: ICLOUD_DOMAINS,
    auth: 'app_password',
    engineType: 'imap_pop3'
  },
  zoho: {
    id: 'zoho',
    label: 'Zoho Mail',
    host: 'imap.zoho.com',
    port: 993,
    domains: ZOHO_DOMAINS,
    auth: 'app_password',
    engineType: 'imap_pop3'
  },
  fastmail: {
    id: 'fastmail',
    label: 'Fastmail',
    host: 'imap.fastmail.com',
    port: 993,
    domains: FASTMAIL_DOMAINS,
    auth: 'app_password',
    engineType: 'imap_pop3'
  },
  aol: {
    id: 'aol',
    label: 'AOL Mail',
    host: 'imap.aol.com',
    port: 993,
    domains: AOL_DOMAINS,
    auth: 'app_password',
    engineType: 'imap_pop3'
  },
  custom: {
    id: 'custom',
    label: '自定义 IMAP / POP3',
    host: '',
    port: 993,
    domains: [],
    auth: 'app_password',
    engineType: 'imap_pop3'
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

export function isMailComDomain(domain?: string): boolean {
  if (!domain) return false;
  const d = domain.trim().toLowerCase();
  return (
    (MAILCOM_DOMAINS as readonly string[]).includes(d) ||
    d === 'mail.com' ||
    d.endsWith('.mail.com')
  );
}

export function autoDetectCustomProvider(email: string): ProviderProfile {
  const domain = domainFromEmail(email) || 'custom.com';
  const isMailCom = isMailComDomain(domain);
  if (isMailCom) {
    return {
      ...PROVIDER_REGISTRY.mailcom,
      domains: [domain]
    };
  }
  return {
    id: 'custom',
    label: `自定义 (${domain})`,
    host: `imap.${domain}`,
    port: 993,
    domains: [domain],
    auth: 'app_password',
    engineType: 'imap_pop3'
  };
}

export function providerForEmail(email: string): ProviderProfile {
  const domain = domainFromEmail(email);
  if (!domain) return autoDetectCustomProvider('user@custom.com');
  if (isMailComDomain(domain)) {
    return {
      ...PROVIDER_REGISTRY.mailcom,
      domains: [domain]
    };
  }
  const matched = Object.values(PROVIDER_REGISTRY).find((provider) => provider.domains.includes(domain));
  if (matched) return matched;
  return autoDetectCustomProvider(email);
}

export function maskEmail(email: string): string {
  const [local, domain] = normalizeEmail(email).split('@');
  if (!local || !domain) return '已隐藏邮箱';
  const prefix = local.length === 1 ? local : `${local.slice(0, 2)}${'•'.repeat(Math.min(4, Math.max(1, local.length - 2)))}`;
  return `${prefix}@${domain}`;
}
