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

  it('accepts OffiLive account kristiannegraleski67@offilive.com', () => {
    const input = {
      ...base,
      accounts: [
        {
          clientAccountId: 'account-offilive',
          email: 'kristiannegraleski67@offilive.com',
          provider: 'offilive',
          auth: { type: 'app_password', secret: 'test-offilive-password' }
        }
      ]
    };
    const parsed = parseCreateJobInput(input);
    expect(parsed.accounts[0].email).toBe('kristiannegraleski67@offilive.com');
    expect(parsed.accounts[0].provider).toBe('offilive');
  });

  it('rejects batch processing (>1 account) when RPA account is included WITHOUT token', () => {
    const batchWithMailCom = {
      ...base,
      accounts: [
        {
          clientAccountId: 'account-1',
          email: 'user1@gmx.com',
          provider: 'gmx',
          auth: { type: 'app_password', secret: 'pass1' }
        },
        {
          clientAccountId: 'account-2',
          email: 'kristian@offilive.com',
          provider: 'offilive',
          auth: { type: 'app_password', secret: 'pass2' }
        }
      ]
    };
    expect(() => parseCreateJobInput(batchWithMailCom)).toThrowError(/Web RPA/);
  });

  it('allows batch processing (>1 account) when RPA account is included WITH token', () => {
    const batchWithToken = {
      ...base,
      token: 'tok_valid_token_123',
      accounts: [
        {
          clientAccountId: 'account-1',
          email: 'user1@gmx.com',
          provider: 'gmx',
          auth: { type: 'app_password', secret: 'pass1' }
        },
        {
          clientAccountId: 'account-2',
          email: 'kristian@offilive.com',
          provider: 'offilive',
          auth: { type: 'app_password', secret: 'pass2' }
        }
      ]
    };
    const parsed = parseCreateJobInput(batchWithToken);
    expect(parsed.accounts.length).toBe(2);
    expect(parsed.token).toBe('tok_valid_token_123');
  });

  it('accepts optional token in job input', () => {
    const inputWithToken = {
      ...base,
      token: 'tok_test1234567890'
    };
    const parsed = parseCreateJobInput(inputWithToken);
    expect(parsed.token).toBe('tok_test1234567890');
  });
});
