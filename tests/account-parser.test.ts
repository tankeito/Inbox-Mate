import { describe, expect, it } from 'vitest';
import { parseAccountText } from '../src/shared/account-parser';

describe('parseAccountText', () => {
  it('preserves delimiters that occur inside a password', () => {
    const parsed = parseAccountText('user@gmx.com:app:password|with,delimiters');
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.accounts[0]).toMatchObject({
      email: 'user@gmx.com',
      secret: 'app:password|with,delimiters',
      provider: 'gmx'
    });
  });

  it('uses exact provider domains and rejects lookalikes', () => {
    const parsed = parseAccountText('user@gmx.evil.com----secret\nuser@notoutlook.com----secret');
    expect(parsed.accounts).toHaveLength(0);
    expect(parsed.invalid.map((item) => item.reason)).toEqual(['unsupported_provider', 'unsupported_provider']);
  });

  it('deduplicates case-insensitively', () => {
    const parsed = parseAccountText('User@rambler.ru----first\nuser@rambler.ru----second');
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.invalid[0].reason).toBe('duplicate');
  });
});
