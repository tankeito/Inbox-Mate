import { describe, expect, it } from 'vitest';
import { parseAccountText, parseAccountTextSmart, parseAccountLineSmart } from '../src/shared/account-parser';

describe('parseAccountText', () => {
  it('parses Mail.com subdomain account rozella.hermann@cheerful.com:JZaNPpwbGHnt', () => {
    const parsed = parseAccountText('rozella.hermann@cheerful.com:JZaNPpwbGHnt');
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.accounts[0]).toMatchObject({
      email: 'rozella.hermann@cheerful.com',
      secret: 'JZaNPpwbGHnt',
      provider: 'mailcom'
    });
  });

  it('preserves delimiters inside a password and extracts custom server parameters (Two-End Shrink Strategy)', () => {
    const parsed = parseAccountLineSmart('user@mycompany.com:p:a:s:s:word:imap.mycompany.com:993:pop3');
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      email: 'user@mycompany.com',
      secret: 'p:a:s:s:word',
      customHost: 'imap.mycompany.com',
      customPort: 993,
      customProtocol: 'pop3',
      provider: 'custom'
    });
  });

  it('accepts unknown email domains as custom provider instead of rejecting them', () => {
    const parsed = parseAccountText('user@customdomain.com----secret123');
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.accounts[0]).toMatchObject({
      email: 'user@customdomain.com',
      secret: 'secret123',
      provider: 'custom'
    });
  });

  it('deduplicates case-insensitively', () => {
    const parsed = parseAccountText('User@rambler.ru----first\nuser@rambler.ru----second');
    expect(parsed.accounts).toHaveLength(1);
    expect(parsed.invalid[0].reason).toBe('duplicate');
  });

  it('parses labeled bracket formats like 【账号: yikzyuucbp@rambler.ru | 密码: 6221938miBdsd】', () => {
    const line = '【账号: yikzyuucbp@rambler.ru | 密码: 6221938miBdsd】';
    const parsed = parseAccountLineSmart(line);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      email: 'yikzyuucbp@rambler.ru',
      secret: '6221938miBdsd',
      provider: 'rambler',
      detectedFormat: 'kv_bracket',
      confidence: 'high',
    });
  });

  it('handles Chinese colons and semicolons', () => {
    const line = '账号：test@outlook.com ； 密码：MyPass123';
    const parsed = parseAccountLineSmart(line);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      email: 'test@outlook.com',
      secret: 'MyPass123',
      provider: 'microsoft',
      detectedFormat: 'kv_bracket',
    });
  });

  it('strips leading noise before email in delimiter mode', () => {
    const line = 'VIP账号----test@gmx.com----pass123';
    const parsed = parseAccountLineSmart(line);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      email: 'test@gmx.com',
      secret: 'pass123',
      provider: 'gmx',
      detectedFormat: 'delimiter',
    });
  });

  it('parses URL query params like email=foo@bar.com&password=secret', () => {
    const line = 'email=user@mail.ru&password=app_secret_123';
    const parsed = parseAccountLineSmart(line);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      email: 'user@mail.ru',
      secret: 'app_secret_123',
      provider: 'mailru',
      detectedFormat: 'json_query',
    });
  });

  it('parses JSON format line with custom host/port', () => {
    const line = '{"email": "user@custom.com", "password": "mypassword123", "imapHost": "imap.custom.com", "imapPort": 993}';
    const parsed = parseAccountLineSmart(line);
    expect(parsed).not.toBeNull();
    expect(parsed).toMatchObject({
      email: 'user@custom.com',
      secret: 'mypassword123',
      customHost: 'imap.custom.com',
      customPort: 993,
      detectedFormat: 'json_query',
    });
  });

  it('correctly calculates statistics in parseAccountTextSmart', () => {
    const text = `
    【账号: a@rambler.ru | 密码: p1】
    b@gmx.com----p2
    email=c@mail.ru&password=p3
    `;
    const res = parseAccountTextSmart(text);
    expect(res.accounts).toHaveLength(3);
    expect(res.stats.validCount).toBe(3);
    expect(res.stats.formatCounts.kv_bracket).toBe(1);
    expect(res.stats.formatCounts.delimiter).toBe(1);
    expect(res.stats.formatCounts.json_query).toBe(1);
  });
});

