import { describe, expect, it } from 'vitest';
import { routeAccountEngine } from '../src/server/engine-router';
import type { AccountInput } from '../src/shared/types';

describe('routeAccountEngine', () => {
  it('routes Mail.com and affiliated domains to web_rpa', () => {
    const mailComAccount: AccountInput = {
      clientAccountId: 'acc-1',
      email: 'shemar_velitbqa@mail.com',
      provider: 'mailcom',
      auth: { type: 'app_password', secret: 'password123' }
    };
    expect(routeAccountEngine(mailComAccount)).toBe('web_rpa');

    const emailComAccount: AccountInput = {
      clientAccountId: 'acc-2',
      email: 'user@email.com',
      provider: 'mailcom',
      auth: { type: 'app_password', secret: 'password123' }
    };
    expect(routeAccountEngine(emailComAccount)).toBe('web_rpa');

    const usaComAccount: AccountInput = {
      clientAccountId: 'acc-3',
      email: 'john@usa.com',
      provider: 'custom',
      auth: { type: 'app_password', secret: 'password123' }
    };
    expect(routeAccountEngine(usaComAccount)).toBe('web_rpa');

    // Test other Mail.com group domains across categories
    const testDomains = [
      'catlover.com',
      'engineer.com',
      'myself.com',
      'dr.com',
      'cheerful.com',
      'europe.com',
      'asia.com',
      'consultant.com',
      'accountant.com',
      'post.com'
    ];
    for (const d of testDomains) {
      const acc: AccountInput = {
        clientAccountId: `acc-${d}`,
        email: `tester@${d}`,
        provider: 'custom',
        auth: { type: 'app_password', secret: 'pass' }
      };
      expect(routeAccountEngine(acc)).toBe('web_rpa');
    }
  });

  it('routes Microsoft OAuth accounts to microsoft_graph', () => {
    const outlookAccount: AccountInput = {
      clientAccountId: 'acc-4',
      email: 'test@outlook.com',
      provider: 'microsoft',
      auth: { type: 'refresh_token', refreshToken: 'dummy_token' }
    };
    expect(routeAccountEngine(outlookAccount)).toBe('microsoft_graph');
  });

  it('routes standard IMAP accounts (Mail.ru, GMX, Rambler) to imap_pop3', () => {
    const mailRuAccount: AccountInput = {
      clientAccountId: 'acc-5',
      email: 'user@mail.ru',
      provider: 'mailru',
      auth: { type: 'app_password', secret: 'password123' }
    };
    expect(routeAccountEngine(mailRuAccount)).toBe('imap_pop3');

    const gmxAccount: AccountInput = {
      clientAccountId: 'acc-6',
      email: 'user@gmx.com',
      provider: 'gmx',
      auth: { type: 'app_password', secret: 'password123' }
    };
    expect(routeAccountEngine(gmxAccount)).toBe('imap_pop3');
  });

  it('routes OffiLive (@offilive.com / offidocs.com / onworks.net) accounts to web_rpa', () => {
    const offiLiveAccount: AccountInput = {
      clientAccountId: 'acc-offilive-1',
      email: 'kristiannegraleski67@offilive.com',
      provider: 'offilive',
      auth: { type: 'app_password', secret: 'pass123' }
    };
    expect(routeAccountEngine(offiLiveAccount)).toBe('web_rpa');

    const offiDocsAccount: AccountInput = {
      clientAccountId: 'acc-offidocs-2',
      email: 'tester@offidocs.com',
      provider: 'custom',
      auth: { type: 'app_password', secret: 'pass456' }
    };
    expect(routeAccountEngine(offiDocsAccount)).toBe('web_rpa');

    const onWorksAccount: AccountInput = {
      clientAccountId: 'acc-onworks-3',
      email: 'user@onworks.net',
      provider: 'custom',
      auth: { type: 'app_password', secret: 'pass789' }
    };
    expect(routeAccountEngine(onWorksAccount)).toBe('web_rpa');
  });

  it('routes custom POP3 accounts to imap_pop3', () => {
    const pop3Account: AccountInput = {
      clientAccountId: 'acc-7',
      email: 'user@custom.com',
      provider: 'custom',
      customProtocol: 'pop3',
      auth: { type: 'app_password', secret: 'password123' }
    };
    expect(routeAccountEngine(pop3Account)).toBe('imap_pop3');
  });
});
