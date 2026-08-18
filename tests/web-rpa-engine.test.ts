import type { APIRequestContext, APIResponse, Page, Route } from 'playwright';
import { describe, expect, it, vi } from 'vitest';
import {
  buildOffiLiveAppDataUrl,
  buildOffiLiveAjaxUrl,
  buildOffiLiveMessageUrl,
  createOffiLiveContextOptions,
  ensureOffiLiveLoginFormVisible,
  ensureMailComLoginFormVisible,
  fetchAccountVerificationCodeViaWebRpa,
  fetchOffiLiveViaAjax,
  installOffiLiveNetworkGuards,
  isOffiLiveThemeStylesheetUrl,
  isOffiLiveUpstreamFailure,
  MAIL_COM_LOGIN_TRIGGER_SELECTOR,
  OFFILIVE_AJAX_URL,
  OFFILIVE_EMAIL_SELECTOR,
  OFFILIVE_LOGIN_URL,
  OFFILIVE_PASSWORD_SELECTOR,
  offiLiveAjaxRequestTimeout,
  parseOffiLiveAppDataScript,
  parseOffiLiveMessageListPayload,
  parseOffiLiveMessagePayload,
  parseMailComListPayload,
  parseWindowsProxyServer,
  safeOffiLiveErrorSummary,
  sanitizeOffiLiveRequestHeaders,
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

function createOffiLivePage(
  attempts: Array<{ status?: number; body?: string; formVisible?: boolean; navigationError?: Error }>
) {
  let attemptIndex = -1;
  const currentAttempt = () => attempts[Math.max(0, attemptIndex)] ?? {};
  const makeInput = () => ({
    waitFor: vi.fn(async () => {
      if (!currentAttempt().formVisible) throw new Error('locator.waitFor: Timeout exceeded');
    })
  });
  const emailInput = makeInput();
  const passwordInput = makeInput();
  const body = {
    innerText: vi.fn(async () => currentAttempt().body ?? '')
  };
  const locator = vi.fn((selector: string) => {
    if (selector === OFFILIVE_EMAIL_SELECTOR) return { first: () => emailInput };
    if (selector === OFFILIVE_PASSWORD_SELECTOR) return { first: () => passwordInput };
    if (selector === 'body') return body;
    throw new Error(`Unexpected selector: ${selector}`);
  });
  const goto = vi.fn(async (url: string) => {
    expect(url).toBe(OFFILIVE_LOGIN_URL);
    attemptIndex += 1;
    const attempt = currentAttempt();
    if (attempt.navigationError) throw attempt.navigationError;
    return { status: () => attempt.status ?? 200 };
  });
  const waitForTimeout = vi.fn(async () => {});
  const page = {
    goto,
    locator,
    url: () => OFFILIVE_LOGIN_URL,
    waitForTimeout
  } as unknown as Page;

  return { page, goto, emailInput, passwordInput, waitForTimeout };
}

function fakeApiResponse(body: unknown, status = 200): APIResponse {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    status: () => status,
    ok: () => status >= 200 && status < 300,
    text: vi.fn(async () => text)
  } as unknown as APIResponse;
}

function appDataScript(options: { auth: boolean; email?: string; token: string }): string {
  return `if(window.__initAppData){window.__initAppData(${JSON.stringify({
    Auth: options.auth,
    AuthAccountHash: options.auth ? 'auth-hash' : '',
    Email: options.email ?? '',
    ProjectHash: 'project-hash',
    System: { token: options.token }
  })});}`;
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

describe('OffiLive login page entry', () => {
  it('removes Playwright call logs that may contain credentials', () => {
    const summary = safeOffiLiveErrorSummary(
      new Error('locator.fill: Timeout 20000ms exceeded.\nCall log:\n - fill("must-not-persist")')
    );

    expect(summary).toBe('locator.fill: Timeout 20000ms exceeded.');
    expect(summary).not.toContain('must-not-persist');
  });

  it('uses a normal Chrome user agent while preserving the detected Clash proxy', () => {
    const options = createOffiLiveContextOptions('HeadlessChrome/151.0.7922.34', 'http://127.0.0.1:7897');

    expect(options.proxy).toEqual({ server: 'http://127.0.0.1:7897' });
    expect(options.locale).toBe('en-US');
    expect(options.userAgent).toContain('Chrome/151.0.7922.34');
    expect(options.userAgent).not.toContain('HeadlessChrome');
  });

  it('removes Chromium client hints only from the scoped OffiLive request headers', () => {
    const headers = sanitizeOffiLiveRequestHeaders(
      {
        accept: 'text/html',
        'accept-encoding': 'gzip, deflate, br, zstd',
        priority: 'u=0, i',
        'sec-ch-ua': '"HeadlessChrome";v="151"',
        'sec-fetch-mode': 'navigate',
        cookie: 'session=kept'
      },
      'Mozilla/5.0 Chrome/151.0.7922.34 Safari/537.36'
    );

    expect(headers).toMatchObject({
      accept: 'text/html',
      cookie: 'session=kept',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'user-agent': 'Mozilla/5.0 Chrome/151.0.7922.34 Safari/537.36'
    });
    expect(headers).not.toHaveProperty('priority');
    expect(headers).not.toHaveProperty('sec-ch-ua');
    expect(headers).not.toHaveProperty('sec-fetch-mode');
    expect(
      sanitizeOffiLiveRequestHeaders(
        { accept: 'text/html' },
        'Mozilla/5.0 Chrome/151.0.7922.34 Safari/537.36'
      )
    ).not.toHaveProperty('accept-encoding');
  });

  it('matches only the optional OffiDocs dynamic theme stylesheet', () => {
    expect(
      isOffiLiveThemeStylesheetUrl(
        'https://www.offidocs.com/SOGo/?/Css/0/User/-/Hash/-/Json/1/'
      )
    ).toBe(true);
    expect(isOffiLiveThemeStylesheetUrl('https://www.offidocs.com/SOGo/?/Ajax/&q[]=/0/')).toBe(false);
    expect(isOffiLiveThemeStylesheetUrl('https://www.offidocs.com/SOGo/rainloop/v/1.0/static/css/app.css')).toBe(
      false
    );
    expect(isOffiLiveThemeStylesheetUrl('http://www.offidocs.com/SOGo/?/Css/0/User/-/')).toBe(false);
    expect(isOffiLiveThemeStylesheetUrl('https://offidocs.example/SOGo/?/Css/0/User/-/')).toBe(false);
  });

  it('fulfills only the dynamic theme stylesheet and keeps Ajax requests on the network', async () => {
    let handler: ((route: Route) => Promise<unknown> | unknown) | undefined;
    const page = {
      route: vi.fn(async (_pattern: string, callback: (route: Route) => Promise<unknown> | unknown) => {
        handler = callback;
      })
    } as unknown as Page;
    await installOffiLiveNetworkGuards(page, 'Normal Chrome UA');

    const cssRoute = {
      request: () => ({
        url: () => 'https://www.offidocs.com/SOGo/?/Css/0/User/-/Default/-/Hash/-/',
        resourceType: () => 'stylesheet',
        headers: () => ({})
      }),
      fulfill: vi.fn(async () => {}),
      continue: vi.fn(async () => {}),
      abort: vi.fn(async () => {})
    } as unknown as Route;
    await handler?.(cssRoute);
    expect(cssRoute.fulfill).toHaveBeenCalledWith({ status: 200, contentType: 'text/css', body: '' });
    expect(cssRoute.continue).not.toHaveBeenCalled();

    const ajaxContinue = vi.fn(async (_options?: { headers?: Record<string, string> }) => {});
    const ajaxRoute = {
      request: () => ({
        url: () => OFFILIVE_AJAX_URL,
        resourceType: () => 'xhr',
        headers: () => ({ 'sec-fetch-mode': 'cors', accept: 'application/json' })
      }),
      fulfill: vi.fn(async () => {}),
      continue: ajaxContinue,
      abort: vi.fn(async () => {})
    } as unknown as Route;
    await handler?.(ajaxRoute);
    expect(ajaxRoute.fulfill).not.toHaveBeenCalled();
    expect(ajaxContinue).toHaveBeenCalledWith({
      headers: expect.objectContaining({ accept: 'application/json', 'user-agent': 'Normal Chrome UA' })
    });
    expect(ajaxContinue.mock.calls[0]?.[0]?.headers).not.toHaveProperty('sec-fetch-mode');
  });

  it('recognizes upstream HTTP errors from either status or rendered text', () => {
    expect(isOffiLiveUpstreamFailure(500, '')).toBe(true);
    expect(isOffiLiveUpstreamFailure(null, '500 Internal Server Error\nAn internal server error occurred.')).toBe(
      true
    );
    expect(isOffiLiveUpstreamFailure(200, 'OffiDocs webmail')).toBe(false);
  });

  it('retries a 500 response and returns the current RainLoop fields', async () => {
    const fixture = createOffiLivePage([
      { status: 500, body: '500 Internal Server Error' },
      { status: 200, body: 'OffiDocs webmail', formVisible: true }
    ]);

    const form = await ensureOffiLiveLoginFormVisible(fixture.page, new AbortController().signal);

    expect(fixture.goto).toHaveBeenCalledTimes(2);
    expect(fixture.waitForTimeout).toHaveBeenCalledWith(500);
    expect(form.attempts).toBe(2);
    expect(form.status).toBe(200);
    expect(form.emailInput).toBe(fixture.emailInput);
    expect(form.passwordInput).toBe(fixture.passwordInput);
  });

  it('reports repeated 500 responses as an upstream connection failure', async () => {
    const fixture = createOffiLivePage([
      { status: 500, body: '500 Internal Server Error' },
      { status: 503, body: '503 Service Unavailable' }
    ]);

    await expect(
      ensureOffiLiveLoginFormVisible(fixture.page, new AbortController().signal)
    ).rejects.toMatchObject({ code: 'CONNECTION_FAILED', status: 502 });
    expect(fixture.goto).toHaveBeenCalledTimes(2);
    expect(fixture.emailInput.waitFor).not.toHaveBeenCalled();
    expect(fixture.passwordInput.waitFor).not.toHaveBeenCalled();
  });

  it('prefers a rendered 500 diagnosis over a navigation timeout', async () => {
    const fixture = createOffiLivePage([
      {
        body: '500 Internal Server Error\nAn internal server error occurred.',
        navigationError: new Error('page.goto: Timeout 12000ms exceeded')
      }
    ]);

    await expect(
      ensureOffiLiveLoginFormVisible(fixture.page, new AbortController().signal, 1)
    ).rejects.toMatchObject({ code: 'CONNECTION_FAILED', status: 502 });
  });
});

describe('OffiLive RainLoop Ajax path', () => {
  it('clamps stage requests to the remaining Ajax budget', () => {
    expect(offiLiveAjaxRequestTimeout(100_000, 60_000, 20_000)).toBe(60_000);
    expect(offiLiveAjaxRequestTimeout(100_000, 60_000, 75_000)).toBe(25_000);
    expect(offiLiveAjaxRequestTimeout(100_000, 60_000, 99_501)).toBe(0);
  });

  it('honors a caller-provided Ajax deadline across session retries', async () => {
    const get = vi.fn();

    const result = await fetchOffiLiveViaAjax(
      { get, post: vi.fn() } as unknown as APIRequestContext,
      {
        clientAccountId: 'expired-ajax-budget',
        email: 'user@offilive.com',
        provider: 'offilive',
        auth: { type: 'app_password', secret: 'unused-password' }
      },
      {
        signal: new AbortController().signal,
        lookbackMinutes: 0,
        maxMessages: 1,
        onProgress: () => {},
        resolveMicrosoftAccessToken: () => ''
      },
      'expired-ajax-budget-trace',
      { source: 'direct' },
      Date.now() - 1
    );

    expect(result).toBeUndefined();
    expect(get).not.toHaveBeenCalled();
  });

  it('parses AppData, nested addresses, list metadata, and message bodies', () => {
    expect(buildOffiLiveAppDataUrl('abc123')).toBe(
      'https://www.offidocs.com/SOGo/?/AppData@no-mobile-0/0/abc123/'
    );
    expect(buildOffiLiveAjaxUrl('auth-hash')).toBe(
      'https://www.offidocs.com/SOGo/?/Ajax/&q[]=/auth-hash/'
    );
    expect(buildOffiLiveMessageUrl('auth-hash', 'INBOX', '42', 'project-hash')).toBe(
      `https://www.offidocs.com/SOGo/?/Ajax/&q[]=/auth-hash/Message/&q[]=/${Buffer.from(
        ['INBOX', '42', 'project-hash', '0'].join('\0')
      ).toString('base64url')}`
    );
    expect(parseOffiLiveAppDataScript(appDataScript({ auth: false, token: 'csrf-before' }))).toMatchObject({
      auth: false,
      token: 'csrf-before',
      projectHash: 'project-hash'
    });

    const listPayload = {
      Action: 'MessageList',
      Result: {
        '@Object': 'Collection/MessageCollection',
        FolderName: 'INBOX',
        '@Collection': [
          {
            Uid: '42',
            Subject: 'Your verification code',
            DateTimeStampInUTC: 1_786_944_303,
            From: {
              '@Object': 'Collection/EmailCollection',
              '@Collection': [{ Name: 'Security', Email: 'security@example.com' }]
            }
          }
        ]
      }
    };
    expect(parseOffiLiveMessageListPayload(listPayload)[0]).toMatchObject({
      id: '42',
      folder: 'INBOX',
      subject: 'Your verification code',
      from: 'Security <security@example.com>'
    });

    expect(
      parseOffiLiveMessagePayload({
        Action: 'Message',
        Result: {
          Uid: '42',
          Folder: 'INBOX',
          Subject: 'Your verification code',
          Plain: 'Verification code: 739812',
          Html: '',
          DateTimeStampInUTC: 1_786_944_303,
          From: { '@Collection': [{ Email: 'security@example.com' }] }
        }
      })
    ).toMatchObject({
      id: '42',
      folder: 'INBOX',
      from: 'security@example.com',
      plain: 'Verification code: 739812'
    });
  });

  it('uses the shared cookie context for Login, authenticated AppData, MessageList, and Message', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(fakeApiResponse(appDataScript({ auth: false, token: 'csrf-before' })))
      .mockResolvedValueOnce(
        fakeApiResponse(appDataScript({ auth: true, email: 'user@offilive.com', token: 'csrf-after' }))
      )
      .mockResolvedValueOnce(
        fakeApiResponse({
          Action: 'Message',
          Result: {
            Uid: '42',
            Folder: 'INBOX',
            Subject: 'Your verification code',
            DateTimeStampInUTC: 1_786_944_303,
            Plain: '',
            Html: '<p>Your verification code is <strong>739812</strong></p>',
            From: { '@Collection': [{ Name: 'Security', Email: 'security@example.com' }] }
          }
        })
      );
    const post = vi
      .fn()
      .mockResolvedValueOnce(fakeApiResponse({ Action: 'Login', Result: true, Time: 10 }))
      .mockResolvedValueOnce(
        fakeApiResponse({
          Action: 'MessageList',
          Result: {
            '@Object': 'Collection/MessageCollection',
            FolderName: 'INBOX',
            '@Collection': [
              {
                Uid: '42',
                Subject: 'Your verification code',
                DateTimeStampInUTC: 1_786_944_303,
                From: { '@Collection': [{ Name: 'Security', Email: 'security@example.com' }] }
              }
            ]
          }
        })
      );
    const progress = vi.fn();

    const result = await fetchOffiLiveViaAjax(
      { get, post } as unknown as APIRequestContext,
      {
        clientAccountId: 'ajax-test',
        email: 'user@offilive.com',
        provider: 'offilive',
        auth: { type: 'app_password', secret: 'test-password' }
      },
      {
        signal: new AbortController().signal,
        lookbackMinutes: 0,
        maxMessages: 5,
        onProgress: progress,
        resolveMicrosoftAccessToken: () => ''
      },
      'ajax-test-trace',
      { server: 'http://127.0.0.1:7897', source: 'local-port' }
    );

    expect(result?.messages[0]).toMatchObject({
      id: 'offilive-42',
      subject: 'Your verification code',
      from: 'Security <security@example.com>',
      htmlBody: '<p>Your verification code is <strong>739812</strong></p>'
    });
    expect(result?.messages[0].textBody).toContain('Your verification code is 739812');
    expect(result?.primaryCode?.code).toBe('739812');
    expect(get).toHaveBeenCalledTimes(3);
    expect(post).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ 'Accept-Encoding': 'identity' }),
      timeout: 35_000
    });
    expect((post.mock.calls[0]?.[1] as { form: Record<string, string> }).form).toMatchObject({
      Action: 'Login',
      Email: 'user@offilive.com',
      Login: '',
      Password: 'test-password',
      XToken: 'csrf-before'
    });
    expect(post.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({ 'Accept-Encoding': 'identity' }),
      timeout: 45_000
    });
    expect((post.mock.calls[1]?.[1] as { form: Record<string, string> }).form).toMatchObject({
      Action: 'MessageList',
      Folder: 'INBOX',
      XToken: 'csrf-after'
    });
    expect(post.mock.calls[1]?.[0]).toBe(buildOffiLiveAjaxUrl('auth-hash'));
    expect(get.mock.calls[2]?.[0]).toBe(buildOffiLiveMessageUrl('auth-hash', 'INBOX', '42', 'project-hash'));
    expect(get.mock.calls[2]?.[1]).toMatchObject({
      headers: expect.objectContaining({ 'Accept-Encoding': 'identity' }),
      timeout: 40_000
    });
    expect(progress).toHaveBeenCalledWith('searching');
    expect(progress).toHaveBeenCalledWith('parsing');
  });

  it('keeps retrying authenticated AppData after two transient timeouts', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(fakeApiResponse(appDataScript({ auth: false, token: 'csrf-before' })))
      .mockRejectedValueOnce(new Error('request.get: Timeout 35000ms exceeded'))
      .mockRejectedValueOnce(new Error('request.get: Timeout 35000ms exceeded'))
      .mockResolvedValueOnce(
        fakeApiResponse(appDataScript({ auth: true, email: 'user@offilive.com', token: 'csrf-after' }))
      );
    const post = vi
      .fn()
      .mockResolvedValueOnce(fakeApiResponse({ Action: 'Login', Result: true }))
      .mockResolvedValueOnce(
        fakeApiResponse({
          Action: 'MessageList',
          Result: { FolderName: 'INBOX', '@Collection': [] }
        })
      );

    const result = await fetchOffiLiveViaAjax(
      { get, post } as unknown as APIRequestContext,
      {
        clientAccountId: 'ajax-confirm-retry',
        email: 'user@offilive.com',
        provider: 'offilive',
        auth: { type: 'app_password', secret: 'test-password' }
      },
      {
        signal: new AbortController().signal,
        lookbackMinutes: 0,
        maxMessages: 1,
        onProgress: () => {},
        resolveMicrosoftAccessToken: () => ''
      },
      'ajax-confirm-retry-trace',
      { source: 'direct' }
    );

    expect(result).toEqual({ messages: [], primaryCode: undefined });
    expect(get).toHaveBeenCalledTimes(4);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('falls back before submitting credentials when AppData cannot be loaded', async () => {
    const get = vi.fn().mockRejectedValue(new Error('request.get: Timeout 12000ms exceeded'));
    const post = vi.fn();

    const result = await fetchOffiLiveViaAjax(
      { get, post } as unknown as APIRequestContext,
      {
        clientAccountId: 'ajax-fallback',
        email: 'user@offilive.com',
        provider: 'offilive',
        auth: { type: 'app_password', secret: 'never-submitted' }
      },
      {
        signal: new AbortController().signal,
        lookbackMinutes: 0,
        maxMessages: 1,
        onProgress: () => {},
        resolveMicrosoftAccessToken: () => ''
      },
      'ajax-fallback-trace',
      { source: 'direct' }
    );

    expect(result).toBeUndefined();
    expect(get).toHaveBeenCalledTimes(2);
    expect(post).not.toHaveBeenCalled();
  });

  it('refreshes ErrorCode 101 once and accepts an empty inbox', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(fakeApiResponse(appDataScript({ auth: false, token: 'stale-token' })))
      .mockResolvedValueOnce(fakeApiResponse(appDataScript({ auth: false, token: 'fresh-token' })))
      .mockResolvedValueOnce(
        fakeApiResponse(appDataScript({ auth: true, email: 'user@offilive.com', token: 'auth-token' }))
      );
    const post = vi
      .fn()
      .mockResolvedValueOnce(fakeApiResponse({ Action: 'Login', Result: false, ErrorCode: 101 }))
      .mockResolvedValueOnce(fakeApiResponse({ Action: 'Login', Result: true }))
      .mockResolvedValueOnce(
        fakeApiResponse({
          Action: 'MessageList',
          Result: { '@Object': 'Collection/MessageCollection', FolderName: 'INBOX', '@Collection': [] }
        })
      );

    const result = await fetchOffiLiveViaAjax(
      { get, post } as unknown as APIRequestContext,
      {
        clientAccountId: 'ajax-token-refresh',
        email: 'user@offilive.com',
        provider: 'offilive',
        auth: { type: 'app_password', secret: 'test-password' }
      },
      {
        signal: new AbortController().signal,
        lookbackMinutes: 0,
        maxMessages: 2,
        onProgress: () => {},
        resolveMicrosoftAccessToken: () => ''
      },
      'ajax-token-refresh-trace',
      { source: 'direct' }
    );

    expect(result).toEqual({ messages: [], primaryCode: undefined });
    expect((post.mock.calls[0]?.[1] as { form: Record<string, string> }).form.XToken).toBe('stale-token');
    expect((post.mock.calls[1]?.[1] as { form: Record<string, string> }).form.XToken).toBe('fresh-token');
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('does not fall back to page login after credentials were submitted', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(fakeApiResponse(appDataScript({ auth: false, token: 'stale-token' })))
      .mockResolvedValueOnce(fakeApiResponse(appDataScript({ auth: false, token: 'fresh-token' })));
    const post = vi
      .fn()
      .mockResolvedValueOnce(fakeApiResponse({ Action: 'Login', Result: false, ErrorCode: 101 }))
      .mockResolvedValueOnce(fakeApiResponse({ Action: 'Login', Result: false, ErrorCode: 101 }));

    await expect(
      fetchOffiLiveViaAjax(
        { get, post } as unknown as APIRequestContext,
        {
          clientAccountId: 'ajax-token-rejected',
          email: 'user@offilive.com',
          provider: 'offilive',
          auth: { type: 'app_password', secret: 'test-password' }
        },
        {
          signal: new AbortController().signal,
          lookbackMinutes: 0,
          maxMessages: 1,
          onProgress: () => {},
          resolveMicrosoftAccessToken: () => ''
        },
        'ajax-token-rejected-trace',
        { source: 'direct' }
      )
    ).rejects.toMatchObject({ code: 'CONNECTION_FAILED', status: 502 });
    expect(get).toHaveBeenCalledTimes(2);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('retries transient HTTP 5xx responses from Ajax Login', async () => {
    vi.useFakeTimers();
    try {
      const get = vi
        .fn()
        .mockResolvedValueOnce(fakeApiResponse(appDataScript({ auth: false, token: 'csrf-before' })))
        .mockResolvedValueOnce(
          fakeApiResponse(appDataScript({ auth: true, email: 'user@offilive.com', token: 'csrf-after' }))
        );
      const post = vi
        .fn()
        .mockResolvedValueOnce(fakeApiResponse({ retryable: true }, 520))
        .mockResolvedValueOnce(fakeApiResponse({ Action: 'Login', Result: true }))
        .mockResolvedValueOnce(
          fakeApiResponse({
            Action: 'MessageList',
            Result: { FolderName: 'INBOX', '@Collection': [] }
          })
        );

      const pending = fetchOffiLiveViaAjax(
        { get, post } as unknown as APIRequestContext,
        {
          clientAccountId: 'ajax-login-retry',
          email: 'user@offilive.com',
          provider: 'offilive',
          auth: { type: 'app_password', secret: 'test-password' }
        },
        {
          signal: new AbortController().signal,
          lookbackMinutes: 0,
          maxMessages: 1,
          onProgress: () => {},
          resolveMicrosoftAccessToken: () => ''
        },
        'ajax-login-retry-trace',
        { source: 'direct' }
      );

      await vi.runAllTimersAsync();
      await expect(pending).resolves.toEqual({ messages: [], primaryCode: undefined });
      expect(post).toHaveBeenCalledTimes(3);
      expect((post.mock.calls[0]?.[1] as { form: Record<string, string> }).form.Action).toBe('Login');
      expect((post.mock.calls[1]?.[1] as { form: Record<string, string> }).form.Action).toBe('Login');
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries a transient timeout while reading the message list', async () => {
    vi.useFakeTimers();
    try {
      const get = vi
        .fn()
        .mockResolvedValueOnce(fakeApiResponse(appDataScript({ auth: false, token: 'csrf-before' })))
        .mockResolvedValueOnce(
          fakeApiResponse(appDataScript({ auth: true, email: 'user@offilive.com', token: 'csrf-after' }))
        );
      const post = vi
        .fn()
        .mockResolvedValueOnce(fakeApiResponse({ Action: 'Login', Result: true }))
        .mockRejectedValueOnce(new Error('apiRequestContext.post: Timeout 60000ms exceeded.'))
        .mockResolvedValueOnce(
          fakeApiResponse({
            Action: 'MessageList',
            Result: { FolderName: 'INBOX', '@Collection': [] }
          })
        );

      const pending = fetchOffiLiveViaAjax(
        { get, post } as unknown as APIRequestContext,
        {
          clientAccountId: 'ajax-list-retry',
          email: 'user@offilive.com',
          provider: 'offilive',
          auth: { type: 'app_password', secret: 'test-password' }
        },
        {
          signal: new AbortController().signal,
          lookbackMinutes: 0,
          maxMessages: 1,
          onProgress: () => {},
          resolveMicrosoftAccessToken: () => ''
        },
        'ajax-list-retry-trace',
        { source: 'direct' }
      );

      await vi.runAllTimersAsync();
      await expect(pending).resolves.toEqual({ messages: [], primaryCode: undefined });
      expect(post).toHaveBeenCalledTimes(3);
      expect((post.mock.calls[1]?.[1] as { form: Record<string, string> }).form.Action).toBe('MessageList');
      expect((post.mock.calls[2]?.[1] as { form: Record<string, string> }).form.Action).toBe('MessageList');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps list metadata when one message body request fails', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(fakeApiResponse(appDataScript({ auth: false, token: 'csrf-before' })))
      .mockResolvedValueOnce(
        fakeApiResponse(appDataScript({ auth: true, email: 'user@offilive.com', token: 'csrf-after' }))
      )
      .mockRejectedValueOnce(new Error('request.get: Timeout 30000ms exceeded'))
      .mockResolvedValueOnce(
        fakeApiResponse({
          Action: 'Message',
          Result: {
            Uid: '42',
            Folder: 'INBOX',
            Subject: 'Security notice',
            DateTimeStampInUTC: 1_786_944_303,
            Plain: 'Verification code: 246810',
            Html: ''
          }
        })
      );
    const post = vi
      .fn()
      .mockResolvedValueOnce(fakeApiResponse({ Action: 'Login', Result: true }))
      .mockResolvedValueOnce(
        fakeApiResponse({
          Action: 'MessageList',
          Result: {
            FolderName: 'INBOX',
            '@Collection': [
              { Uid: '43', Subject: 'Newest message', DateTimeStampInUTC: 1_786_944_304 },
              { Uid: '42', Subject: 'Security notice', DateTimeStampInUTC: 1_786_944_303 }
            ]
          }
        })
      )
      .mockRejectedValueOnce(new Error('request.post: Timeout 30000ms exceeded'));

    const result = await fetchOffiLiveViaAjax(
      { get, post } as unknown as APIRequestContext,
      {
        clientAccountId: 'ajax-partial-body',
        email: 'user@offilive.com',
        provider: 'offilive',
        auth: { type: 'app_password', secret: 'test-password' }
      },
      {
        signal: new AbortController().signal,
        lookbackMinutes: 0,
        maxMessages: 2,
        onProgress: () => {},
        resolveMicrosoftAccessToken: () => ''
      },
      'ajax-partial-body-trace',
      { source: 'direct' }
    );

    expect(result?.messages).toHaveLength(2);
    expect(result?.messages[0]).toMatchObject({ id: 'offilive-43', subject: 'Newest message' });
    expect(result?.primaryCode?.code).toBe('246810');
  });

  it('fails explicitly when every message body request fails and no subject contains a code', async () => {
    const get = vi
      .fn()
      .mockResolvedValueOnce(fakeApiResponse(appDataScript({ auth: false, token: 'csrf-before' })))
      .mockResolvedValueOnce(
        fakeApiResponse(appDataScript({ auth: true, email: 'user@offilive.com', token: 'csrf-after' }))
      )
      .mockRejectedValueOnce(new Error('request.get: Timeout 30000ms exceeded'));
    const post = vi
      .fn()
      .mockResolvedValueOnce(fakeApiResponse({ Action: 'Login', Result: true }))
      .mockResolvedValueOnce(
        fakeApiResponse({
          Action: 'MessageList',
          Result: {
            FolderName: 'INBOX',
            '@Collection': [{ Uid: '42', Subject: 'Security notice', DateTimeStampInUTC: 1_786_944_303 }]
          }
        })
      )
      .mockRejectedValueOnce(new Error('request.post: Timeout 30000ms exceeded'));

    await expect(
      fetchOffiLiveViaAjax(
        { get, post } as unknown as APIRequestContext,
        {
          clientAccountId: 'ajax-all-bodies-failed',
          email: 'user@offilive.com',
          provider: 'offilive',
          auth: { type: 'app_password', secret: 'test-password' }
        },
        {
          signal: new AbortController().signal,
          lookbackMinutes: 0,
          maxMessages: 1,
          onProgress: () => {},
          resolveMicrosoftAccessToken: () => ''
        },
        'ajax-all-bodies-failed-trace',
        { source: 'direct' }
      )
    ).rejects.toMatchObject({ code: 'CONNECTION_FAILED', status: 502 });
  });

  it('does not misclassify RainLoop AuthError as a network or token failure', async () => {
    const get = vi.fn().mockResolvedValue(fakeApiResponse(appDataScript({ auth: false, token: 'csrf' })));
    const post = vi.fn().mockResolvedValue(
      fakeApiResponse({ Action: 'Login', Result: false, ErrorCode: 102, ErrorMessage: '', Time: 10 })
    );

    await expect(
      fetchOffiLiveViaAjax(
        { get, post } as unknown as APIRequestContext,
        {
          clientAccountId: 'ajax-auth-failed',
          email: 'user@offilive.com',
          provider: 'offilive',
          auth: { type: 'app_password', secret: 'wrong-password' }
        },
        {
          signal: new AbortController().signal,
          lookbackMinutes: 0,
          maxMessages: 1,
          onProgress: () => {},
          resolveMicrosoftAccessToken: () => ''
        },
        'ajax-auth-failed-trace',
        { source: 'direct' }
      )
    ).rejects.toMatchObject({ code: 'AUTH_FAILED', status: 400 });
  });

  it('reports RainLoop two-factor errors as requiring additional authentication', async () => {
    const get = vi.fn().mockResolvedValue(fakeApiResponse(appDataScript({ auth: false, token: 'csrf' })));
    const post = vi.fn().mockResolvedValue(
      fakeApiResponse({ Action: 'Login', Result: false, ErrorCode: 121, ErrorMessage: '', Time: 10 })
    );

    await expect(
      fetchOffiLiveViaAjax(
        { get, post } as unknown as APIRequestContext,
        {
          clientAccountId: 'ajax-two-factor',
          email: 'user@offilive.com',
          provider: 'offilive',
          auth: { type: 'app_password', secret: 'test-password' }
        },
        {
          signal: new AbortController().signal,
          lookbackMinutes: 0,
          maxMessages: 1,
          onProgress: () => {},
          resolveMicrosoftAccessToken: () => ''
        },
        'ajax-two-factor-trace',
        { source: 'direct' }
      )
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED', status: 400 });
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

    // Also for OffiLive
    const offiliveController = new AbortController();
    offiliveController.abort();

    await expect(
      fetchAccountVerificationCodeViaWebRpa(
        {
          clientAccountId: 'cancelled-offilive',
          email: 'kristian@offilive.com',
          provider: 'offilive',
          auth: { type: 'app_password', secret: 'unused-password' }
        },
        {
          signal: offiliveController.signal,
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
