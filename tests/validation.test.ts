import { describe, expect, it } from 'vitest';
import { parseCreateJobInput } from '../src/server/validation';

const base = {
  accounts: [
    {
      clientAccountId: 'account-1',
      email: 'user@gmx.com',
      provider: 'gmx',
      auth: { type: 'app_password', secret: 'transient-secret' }
    }
  ],
  lookbackMinutes: 30,
  maxMessagesPerAccount: 5
};

describe('parseCreateJobInput', () => {
  it('accepts the fixed provider contract', () => {
    expect(parseCreateJobInput(base).accounts[0].email).toBe('user@gmx.com');
  });

  it('accepts Mail.com cheerful.com subdomain accounts', () => {
    const input = {
      ...base,
      accounts: [
        {
          clientAccountId: 'account-mailcom',
          email: 'rozella.hermann@cheerful.com',
          provider: 'mailcom',
          auth: { type: 'app_password', secret: 'JZaNPpwbGHnt' }
        }
      ]
    };
    const parsed = parseCreateJobInput(input);
    expect(parsed.accounts[0].email).toBe('rozella.hermann@cheerful.com');
    expect(parsed.accounts[0].provider).toBe('mailcom');
  });

  it('accepts custom server parameters (customHost, customPort, customProtocol)', () => {
    const input = {
      ...base,
      accounts: [
        {
          clientAccountId: 'account-custom',
          email: 'user@customdomain.com',
          provider: 'custom',
          customHost: 'imap.customdomain.com',
          customPort: 993,
          customProtocol: 'imap',
          auth: { type: 'app_password', secret: 'pass' }
        }
      ]
    };
    const parsed = parseCreateJobInput(input);
    expect(parsed.accounts[0].customHost).toBe('imap.customdomain.com');
    expect(parsed.accounts[0].customPort).toBe(993);
    expect(parsed.accounts[0].customProtocol).toBe('imap');
  });

  it('requires OAuth sessions for Microsoft accounts', () => {
    expect(() =>
      parseCreateJobInput({
        ...base,
        accounts: [{ ...base.accounts[0], email: 'user@outlook.com', provider: 'microsoft' }]
      })
    ).toThrowError(/授权/);
  });
});
