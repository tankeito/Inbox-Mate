import * as tls from 'node:tls';
import { simpleParser } from 'mailparser';
import type { AccountInput, CodeMatch, EmailItem } from '../shared/types.js';
import { extractVerificationCode } from '../shared/verification-code.js';
import { InboxMateError } from './errors.js';
import { PROVIDER_REGISTRY } from './providers.js';
import type { FetchAccountOptions, FetchAccountResult } from './imap-client.js';

const MAX_POP3_MESSAGES = 15;

class Pop3SocketClient {
  private socket: tls.TLSSocket | null = null;
  private buffer = '';

  async connect(host: string, port: number, timeoutMs = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
      let connected = false;
      const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false }, () => {
        connected = true;
      });

      socket.setTimeout(timeoutMs);
      socket.setEncoding('utf8');

      const onData = (data: string) => {
        this.buffer += data;
        if (this.buffer.includes('\r\n')) {
          const line = this.buffer.slice(0, this.buffer.indexOf('\r\n'));
          this.buffer = this.buffer.slice(this.buffer.indexOf('\r\n') + 2);
          socket.removeListener('data', onData);
          if (line.startsWith('+OK')) resolve(line);
          else reject(new InboxMateError('CONNECTION_FAILED', 400, `POP3 服务器响应错误: ${line}`));
        }
      };

      socket.on('data', onData);
      socket.on('error', (err) => {
        if (!connected) reject(new InboxMateError('CONNECTION_FAILED', 400, `POP3 连接失败: ${err.message}`));
      });
      socket.on('timeout', () => {
        socket.destroy();
        reject(new InboxMateError('TIMEOUT', 408, 'POP3 连接超时 (3s Socket Timeout)'));
      });

      this.socket = socket;
    });
  }

  async sendCommand(cmd: string): Promise<string> {
    if (!this.socket || this.socket.destroyed) {
      throw new InboxMateError('CONNECTION_FAILED', 400, 'POP3 Socket 已断开');
    }

    return new Promise((resolve, reject) => {
      this.buffer = '';
      const onData = (data: string) => {
        this.buffer += data;
        if (this.buffer.includes('\r\n')) {
          const idx = this.buffer.indexOf('\r\n');
          const line = this.buffer.slice(0, idx);
          this.buffer = this.buffer.slice(idx + 2);
          this.socket?.removeListener('data', onData);
          resolve(line);
        }
      };

      this.socket?.on('data', onData);
      this.socket?.write(`${cmd}\r\n`, 'utf8', (err) => {
        if (err) {
          this.socket?.removeListener('data', onData);
          reject(new InboxMateError('CONNECTION_FAILED', 400, `发送 POP3 指令失败: ${err.message}`));
        }
      });
    });
  }

  async retrieveMessage(id: number): Promise<string> {
    if (!this.socket || this.socket.destroyed) {
      throw new InboxMateError('CONNECTION_FAILED');
    }

    return new Promise((resolve, reject) => {
      let content = '';
      const onData = (data: string) => {
        content += data;
        // POP3 multiline response terminates with CRLF.CRLF (\r\n.\r\n)
        if (content.endsWith('\r\n.\r\n') || content.includes('\r\n.\r\n')) {
          this.socket?.removeListener('data', onData);
          const firstLineEnd = content.indexOf('\r\n');
          const firstLine = content.slice(0, firstLineEnd);
          if (!firstLine.startsWith('+OK')) {
            return reject(new InboxMateError('INTERNAL', 500, `POP3 RETR 失败: ${firstLine}`));
          }
          const body = content.slice(firstLineEnd + 2, content.indexOf('\r\n.\r\n'));
          resolve(body);
        }
      };

      this.socket?.on('data', onData);
      this.socket?.write(`RETR ${id}\r\n`, 'utf8', (err) => {
        if (err) {
          this.socket?.removeListener('data', onData);
          reject(new InboxMateError('CONNECTION_FAILED', 400, `POP3 RETR 发送失败: ${err.message}`));
        }
      });
    });
  }

  close(): void {
    if (this.socket && !this.socket.destroyed) {
      try {
        this.socket.write('QUIT\r\n');
      } catch {
        // ignore
      }
      this.socket.destroy();
    }
  }
}

export async function fetchAccountVerificationCodeViaPop3(
  account: AccountInput,
  options: FetchAccountOptions
): Promise<FetchAccountResult> {
  options.onProgress('authenticating');

  if (account.auth.type !== 'app_password') {
    throw new InboxMateError('AUTH_REQUIRED', 400, 'POP3 协议仅支持密码/应用专用密码登录');
  }

  const provider = PROVIDER_REGISTRY[account.provider];
  let host = account.customHost;
  let port = account.customPort || 995;

  if (!host) {
    if (account.provider === 'mailcom') {
      host = 'pop.mail.com';
    } else if (account.provider === 'gmx') {
      host = 'pop.gmx.com';
    } else if (account.provider === 'rambler') {
      host = 'pop.rambler.ru';
    } else if (account.provider === 'mailru') {
      host = 'pop.mail.ru';
    } else {
      const domain = account.email.split('@')[1] || 'custom.com';
      host = `pop.${domain}`;
    }
  }

  const client = new Pop3SocketClient();
  const closeOnAbort = () => client.close();
  options.signal.addEventListener('abort', closeOnAbort, { once: true });

  try {
    options.onProgress('connecting');
    const isCustomHost = account.provider === 'custom' || Boolean(account.customHost);
    const timeoutMs = isCustomHost ? 3000 : 8000;
    await client.connect(host, port, timeoutMs);

    if (options.signal.aborted) throw new InboxMateError('CANCELLED');

    const userRes = await client.sendCommand(`USER ${account.email}`);
    if (!userRes.startsWith('+OK')) {
      throw new InboxMateError('AUTH_FAILED', 400, `POP3 用户名拒绝: ${userRes}`);
    }

    const passRes = await client.sendCommand(`PASS ${account.auth.secret}`);
    if (!passRes.startsWith('+OK')) {
      if (account.provider === 'mailcom' || account.email.endsWith('cheerful.com') || account.email.endsWith('mail.com')) {
        throw new InboxMateError(
          'MAILCOM_IMAP_DISABLED',
          401,
          'Mail.com 账号连接失败：未在网页端开启【POP3 & IMAP Access】选项。'
        );
      }
      throw new InboxMateError('AUTH_FAILED', 401, `POP3 密码认证失败: ${passRes}`);
    }

    options.onProgress('searching');
    const statRes = await client.sendCommand('STAT');
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');

    const match = statRes.match(/^\+OK\s+(\d+)\s+(\d+)/i);
    const totalCount = match ? parseInt(match[1], 10) : 0;
    if (totalCount === 0) {
      return { messages: [] };
    }

    options.onProgress('parsing');
    const fetchCount = Math.min(totalCount, options.maxMessages || MAX_POP3_MESSAGES);
    const emailItems: EmailItem[] = [];
    const matches: CodeMatch[] = [];

    for (let i = 0; i < fetchCount; i++) {
      if (options.signal.aborted) throw new InboxMateError('CANCELLED');
      const msgId = totalCount - i; // fetch latest messages first
      try {
        const rawMime = await client.retrieveMessage(msgId);
        const parsed = await simpleParser(rawMime);

        const subject = parsed.subject || '(无主题)';
        const from = parsed.from?.text || account.email;
        const receivedAt = parsed.date ? parsed.date.toISOString() : new Date().toISOString();
        const textBody = (parsed.text || '').slice(0, 256 * 1024);
        const htmlBody = typeof parsed.html === 'string' ? parsed.html.slice(0, 256 * 1024) : undefined;
        const snippet = textBody.trim().replace(/\s+/g, ' ').slice(0, 300) || '(无正文预览)';

        const codeMatch = extractVerificationCode({
          subject,
          text: textBody,
          receivedAt: new Date(receivedAt),
          from
        });
        if (codeMatch) matches.push(codeMatch);

        emailItems.push({
          id: `${account.clientAccountId}-pop-${msgId}`,
          accountEmail: account.email,
          provider: account.provider,
          subject,
          from,
          receivedAt,
          snippet,
          textBody: textBody || undefined,
          htmlBody,
          codeMatch: codeMatch ?? undefined
        });
      } catch {
        // Continue to next message on individual retrieve error
      }
    }

    matches.sort((a, b) => b.score - a.score || Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
    const primaryCode = matches[0];

    return { messages: emailItems, primaryCode };
  } catch (error) {
    if (error instanceof InboxMateError) throw error;
    throw new InboxMateError('CONNECTION_FAILED', 400, (error as Error).message || 'POP3 连接与接收异常');
  } finally {
    options.signal.removeEventListener('abort', closeOnAbort);
    client.close();
  }
}
