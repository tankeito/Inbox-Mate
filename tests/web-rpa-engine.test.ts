import { describe, expect, it } from 'vitest';
import {
  fetchAccountVerificationCodeViaWebRpa,
  parseMailComListPayload,
  parseWindowsProxyServer,
  selectMailComMessages
} from '../src/server/engines/web-rpa-engine';

describe('Mail.com Web RPA payload parsing', () => {
  it('parses the current maillist.mail.com response shape', () => {
    const messages = parseMailComListPayload({
      mailListElements: [
        {
          type: 'mail',
          rawData: {
            attribute: {
              mailIdentifier: '1785189904201236352',
              internalDate: 1785189904000
            },
            mailHeader: {
              subject: 'Your verification code is 482913',
              from: 'Example <security@example.com>',
              date: 1785189903000
            },
            mailURI: 'Mail/1785189904201236352',
            mailBodyURI: 'Mail/1785189904201236352/Body'
          }
        }
      ],
      totalCount: 1
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: '1785189904201236352',
      subject: 'Your verification code is 482913',
      from: 'Example <security@example.com>'
    });
    expect(messages[0].receivedAt.toISOString()).toBe('2026-07-27T22:05:03.000Z');
  });

  it('keeps compatibility with the legacy messages response shape', () => {
    const messages = parseMailComListPayload({
      data: {
        messages: [
          {
            id: 'mail-12345678',
            subject: 'Legacy message',
            from: { displayName: 'Sender', emailAddress: 'sender@example.com' },
            snippet: 'Code 135790',
            receiveDate: '2026-08-11T03:00:00.000Z'
          }
        ]
      }
    });

    expect(messages[0]).toMatchObject({
      id: '12345678',
      subject: 'Legacy message',
      from: 'Sender <sender@example.com>',
      body: 'Code 135790'
    });
  });

  it('applies the configured lookback window and message limit', () => {
    const now = Date.now();
    const messages = [
      { id: 'newest', subject: 'Newest', from: '', receivedAt: new Date(now - 60_000), snippet: '', body: '' },
      { id: 'recent', subject: 'Recent', from: '', receivedAt: new Date(now - 120_000), snippet: '', body: '' },
      { id: 'old', subject: 'Old', from: '', receivedAt: new Date(now - 3_600_000), snippet: '', body: '' }
    ];

    expect(selectMailComMessages(messages, { lookbackMinutes: 30, maxMessages: 1 }).map((mail) => mail.id)).toEqual([
      'newest'
    ]);
  });

  it('does not launch a browser for an already-cancelled task', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      fetchAccountVerificationCodeViaWebRpa(
        {
          clientAccountId: 'cancelled',
          email: 'user@mail.com',
          provider: 'mailcom',
          auth: { type: 'app_password', secret: 'unused-password' }
        },
        {
          signal: controller.signal,
          lookbackMinutes: 0,
          maxMessages: 1,
          onProgress: () => {},
          resolveMicrosoftAccessToken: () => ''
        }
      )
    ).rejects.toMatchObject({ code: 'CANCELLED' });
  });
});

describe('Windows proxy parsing', () => {
  it('normalizes the Clash mixed-port setting', () => {
    expect(parseWindowsProxyServer('127.0.0.1:7897')).toBe('http://127.0.0.1:7897');
  });

  it('prefers the HTTPS endpoint in a protocol-specific setting', () => {
    expect(parseWindowsProxyServer('http=127.0.0.1:7890;https=127.0.0.1:7897;socks=127.0.0.1:7891')).toBe(
      'http://127.0.0.1:7897'
    );
  });

  it('rejects incomplete proxy endpoints', () => {
    expect(parseWindowsProxyServer('127.0.0.1')).toBeUndefined();
  });
});
