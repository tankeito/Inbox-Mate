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

  it('rejects client-controlled IMAP connection fields', () => {
    expect(() => parseCreateJobInput({ ...base, imapHost: '127.0.0.1', imapPort: 993 })).toThrow();
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
