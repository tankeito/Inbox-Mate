import type { Page } from 'playwright';
import { describe, expect, it, vi } from 'vitest';
import {
  ensureMailComLoginFormVisible,
  fetchAccountVerificationCodeViaWebRpa,
  MAIL_COM_LOGIN_TRIGGER_SELECTOR,
  parseMailComListPayload,
  parseWindowsProxyServer,
  selectMailComMessages
} from '../src/server/engines/web-rpa-engine';

function createLoginPage(options: { initiallyVisible?: boolean; revealOnClick?: boolean } = {}) {
  let formVisible = options.initiallyVisible ?? false;
  const revealOnClick = options.revealOnClick ?? true;
  const makeInput = () => ({
    isVisible: vi.fn(async () => formVisible),
    waitFor: vi.fn(async () => {
      if (!formVisible) throw new Error('input remains hidden');
    })
  });
  const emailInput = makeInput();
  const passwordInput = makeInput();
  const loginTrigger = {
    waitFor: vi.fn(async () => {}),
    click: vi.fn(async () => {
      if (revealOnClick) formVisible = true;
    })
  };
  const first = vi.fn(() => loginTrigger);
  const filter = vi.fn(() => ({ first }));
  const locator = vi.fn((selector: string) => {
    if (selector === '#login-email') return emailInput;
    if (selector === '#login-password') return passwordInput;
    if (selector === MAIL_COM_LOGIN_TRIGGER_SELECTOR) return { filter };
    throw new Error(`Unexpected selector: ${selector}`);
  });
  const waitForTimeout = vi.fn(async () => {});

  return {
    page: { locator, waitForTimeout } as unknown as Page,
    emailInput,
    passwordInput,
    loginTrigger,
    locator,
    filter,
    first,
    waitForTimeout
  };
}

describe('Mail.com login form entry', () => {
  it('keeps the current visible link and legacy id selectors', () => {
    expect(MAIL_COM_LOGIN_TRIGGER_SELECTOR.split(', ')).toEqual([
      'a.button.button-login[href="homepage.html#navlogin"]',
      '#login-button'
    ]);
  });

  it('opens the login form and waits for both credential fields', async () => {
    const fixture = createLoginPage();

    const result = await ensureMailComLoginFormVisible(fixture.page);

    expect(fixture.locator).toHaveBeenCalledWith(MAIL_COM_LOGIN_TRIGGER_SELECTOR);
    expect(fixture.filter).toHaveBeenCalledWith({ visible: true });
    expect(fixture.first).toHaveBeenCalledOnce();
    expect(fixture.loginTrigger.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 10_000 });
    expect(fixture.loginTrigger.click).toHaveBeenCalledOnce();
    expect(fixture.emailInput.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 4000 });
    expect(fixture.passwordInput.waitFor).toHaveBeenCalledWith({ state: 'visible', timeout: 4000 });
    expect(result.emailInput).toBe(fixture.emailInput);
    expect(result.passwordInput).toBe(fixture.passwordInput);
  });

  it('does not click the login trigger when the form is already visible', async () => {
    const fixture = createLoginPage({ initiallyVisible: true });

    await ensureMailComLoginFormVisible(fixture.page);

    expect(fixture.locator).not.toHaveBeenCalledWith(MAIL_COM_LOGIN_TRIGGER_SELECTOR);
    expect(fixture.loginTrigger.click).not.toHaveBeenCalled();
  });

  it('fails explicitly when both credential fields never become visible', async () => {
    const fixture = createLoginPage({ revealOnClick: false });

    await expect(ensureMailComLoginFormVisible(fixture.page)).rejects.toMatchObject({ code: 'TIMEOUT' });
    expect(fixture.loginTrigger.click).toHaveBeenCalledTimes(3);
    expect(fixture.waitForTimeout).toHaveBeenCalledTimes(2);
  });
});

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
