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
  'outlook.de',
  'outlook.jp',
  'outlook.co.uk',
  'hotmail.co.uk',
  'hotmail.de'
] as const;

export const OFFILIVE_DOMAINS = ['offilive.com', 'offidocs.com', 'onworks.net'] as const;

const GMX_DOMAINS = ['gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.ch', 'gmx.fr', 'gmx.co.uk', 'gmx.us', 'gmx.info'] as const;
const RAMBLER_DOMAINS = ['rambler.ru', 'myrambler.ru', 'ro.ru', 'lenta.ru', 'autorambler.ru'] as const;
const MAILRU_DOMAINS = ['mail.ru', 'inbox.ru', 'list.ru', 'bk.ru', 'internet.ru'] as const;

export const MAILCOM_DOMAINS = [
  '2trom.com',
  'accountant.com',
  'acdcfan.com',
  'actuary.net',
  'adexec.com',
  'africa.com',
  'africamail.com',
  'alaska.com',
  'allergist.com',
  'alumni.com',
  'alumnidirector.com',
  'ambulance.net',
  'americamel.net',
  'angelic.com',
  'animail.net',
  'appraiser.net',
  'archaeologist.com',
  'architect.com',
  'arizona.com',
  'artlover.com',
  'asia.com',
  'asiamail.com',
  'atheist.com',
  'auctioneer.net',
  'australiamail.com',
  'bartender.net',
  'bellair.net',
  'berlin.com',
  'bikerider.com',
  'birdlover.com',
  'blader.com',
  'boardermail.com',
  'boatlover.com',
  'boston.com',
  'bowling.com',
  'brazilmail.com',
  'brew-master.com',
  'brewer.com',
  'brewmeister.com',
  'bsdmail.com',
  'californiamail.com',
  'cameraman.net',
  'caregiver.com',
  'cashier.com',
  'catlover.com',
  'cheerful.com',
  'chef.net',
  'chemist.com',
  'chinamail.com',
  'clerk.com',
  'cliffhanger.com',
  'clubmember.org',
  'collector.org',
  'columnist.com',
  'comic.com',
  'computer4u.com',
  'consultant.com',
  'contractor.net',
  'cook.net',
  'counsellor.com',
  'count.com',
  'couple.com',
  'crew22.net',
  'cricketer.com',
  'customsagent.com',
  'cutey.com',
  'cyber-wizard.com',
  'cyberdude.com',
  'cybergal.com',
  'dallasmail.com',
  'dbzmail.com',
  'deliveryman.com',
  'denmarkmail.com',
  'diplomats.com',
  'disciples.com',
  'discofan.com',
  'disposable.com',
  'doctor.com',
  'doglover.com',
  'doramail.com',
  'dr.com',
  'dublin.com',
  'dutchmail.com',
  'elvis.com',
  'elvisfan.com',
  'email.com',
  'engineer.com',
  'englandmail.com',
  'europe.com',
  'europemail.com',
  'execs.com',
  'financier.com',
  'finlandmail.com',
  'fireman.net',
  'flightattendant.net',
  'floridamail.com',
  'football.com',
  'galaxyhit.com',
  'gardener.com',
  'gardener.net',
  'geologist.com',
  'germanymail.com',
  'graduate.org',
  'graphic-designer.com',
  'greenmail.net',
  'hackermail.com',
  'hairdresser.net',
  'hilarious.com',
  'hiphopfan.com',
  'hockeymail.com',
  'homemail.com',
  'hot-shot.com',
  'housewife.com',
  'humanoid.net',
  'hypnotherapist.net',
  'iname.com',
  'indiamail.com',
  'innocent.com',
  'inorbit.com',
  'instruction.com',
  'instructor.net',
  'insurer.com',
  'irelandmail.com',
  'israelmail.com',
  'italymail.com',
  'japan.com',
  'journalist.com',
  'keromail.com',
  'kissfans.com',
  'kittymail.com',
  'koreamail.com',
  'lawyer.com',
  'legislator.com',
  'linuxmail.org',
  'lobbyist.com',
  'london.com',
  'loveable.com',
  'lovecat.com',
  'mad.scientist.com',
  'madonna.com',
  'madonnafan.com',
  'madrid.com',
  'mail.com',
  'mail.org',
  'marchmail.com',
  'metalfan.com',
  'mexicomail.com',
  'mindless.com',
  'minister.com',
  'mobsters.com',
  'monarchy.com',
  'moscowmail.com',
  'munich.com',
  'musician.org',
  'muslim.com',
  'myself.com',
  'net-shopping.com',
  'newyorkmail.com',
  'nightly.com',
  'ninfan.com',
  'ninja.com',
  'nonpartisan.com',
  'northeast.com',
  'null.net',
  'nurse.net',
  'nycmail.com',
  'oceanfreight.net',
  'officemail.com',
  'optician.com',
  'orthodontist.net',
  'orthodox.com',
  'paris.com',
  'pediatrician.com',
  'petlover.com',
  'photographer.net',
  'physicist.net',
  'poetic.com',
  'polandmail.com',
  'policeman.net',
  'politician.com',
  'popstar.com',
  'portugalmail.com',
  'post.com',
  'presidency.com',
  'priest.com',
  'programmer.net',
  'protestant.com',
  'proud.com',
  'publicist.com',
  'radiologist.net',
  'rare.com',
  'ravemail.com',
  'realtyagent.com',
  'reborn.com',
  'reggae.com',
  'reggaefan.com',
  'registerednurses.com',
  'reiki.com',
  'reincarnate.com',
  'religious.com',
  'repairman.com',
  'representative.com',
  'rescueteam.com',
  'rome.com',
  'royal.net',
  'russia.com',
  'sailormoon.com',
  'saintly.com',
  'salesperson.net',
  'sanfranmail.com',
  'scientist.com',
  'scotlandmail.com',
  'secretary.net',
  'sinful.com',
  'singapore.com',
  'sky.com',
  'socialworker.net',
  'sociologist.com',
  'solution4u.com',
  'songwriter.net',
  'spainmail.com',
  'specialist.com',
  'starmail.com',
  'superheromail.com',
  'surfer.com',
  'surgical.net',
  'swedenmail.com',
  'sweetheart.com',
  'swissmail.com',
  'switzerlandmail.com',
  'teachers.org',
  'techie.com',
  'technologist.com',
  'texas.com',
  'theplate.com',
  'therapist.net',
  'toke.com',
  'tokyo.com',
  'toothfairy.com',
  'torontomail.com',
  'tvstar.com',
  'umpire.com',
  'uniforms.com',
  'usa.com',
  'usatodaymail.com',
  'uymail.com',
  'vampiremail.com',
  'videomaker.net',
  'vipmail.com',
  'volleyball.com',
  'webname.com',
  'whoever.com',
  'winning.com',
  'witty.com',
  'worker.com',
  'workmail.com',
  'writeme.com',
  'writer.com',
  'yours.com'
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
  offilive: {
    id: 'offilive',
    label: 'OffiLive',
    host: 'www.offidocs.com',
    port: 443,
    domains: OFFILIVE_DOMAINS,
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

export function isOffiLiveDomain(domain?: string): boolean {
  if (!domain) return false;
  const d = domain.trim().toLowerCase();
  return (
    (OFFILIVE_DOMAINS as readonly string[]).includes(d) ||
    d === 'offilive.com' ||
    d.endsWith('.offilive.com') ||
    d === 'offidocs.com' ||
    d.endsWith('.offidocs.com') ||
    d === 'onworks.net' ||
    d.endsWith('.onworks.net')
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
  if (isOffiLiveDomain(domain)) {
    return {
      ...PROVIDER_REGISTRY.offilive,
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
  if (isOffiLiveDomain(domain)) {
    return {
      ...PROVIDER_REGISTRY.offilive,
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
