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
