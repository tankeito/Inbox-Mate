import { ImapFlow, type FetchMessageObject, type MessageStructureObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { AccountInput, CodeMatch, EmailItem } from '../shared/types.js';
import { extractVerificationCode } from '../shared/verification-code.js';
import { InboxMateError, classifyImapError } from './errors.js';
import { PROVIDER_REGISTRY } from './providers.js';

const MAX_MESSAGE_BYTES = 1024 * 1024;
const MAX_TEXT_PART_BYTES = 256 * 1024;
const MAX_CANDIDATE_METADATA = 48;

export interface FetchAccountOptions {
  lookbackMinutes: number;
  maxMessages: number;
  signal: AbortSignal;
  onProgress: (state: 'authenticating' | 'connecting' | 'searching' | 'parsing') => void;
  resolveMicrosoftAccessToken: (sessionId: string, email: string) => string;
}

interface CandidateMessage {
  uid: number;
  subject: string;
  from: string;
  receivedAt: Date;
  size: number;
  bodyStructure?: MessageStructureObject;
}

function selectTextParts(structure?: MessageStructureObject): Array<{ part: string; type: string }> {
  if (!structure) return [];
  const parts: Array<{ part: string; type: string }> = [];
  const visit = (node: MessageStructureObject): void => {
    if ((node.type === 'text/plain' || node.type === 'text/html') && node.disposition !== 'attachment') {
      parts.push({ part: node.part ?? '1', type: node.type });
    }
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(structure);
  return parts.sort((left, right) => Number(right.type === 'text/plain') - Number(left.type === 'text/plain'));
}

async function streamToBuffer(stream: AsyncIterable<Buffer | string>, signal: AbortSignal): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    if (signal.aborted) throw new InboxMateError('CANCELLED');
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_TEXT_PART_BYTES) throw new InboxMateError('INTERNAL');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

interface DecodedPart {
  text: string;
  html?: string;
}

async function decodeTextPart(content: Buffer, contentType: string): Promise<DecodedPart> {
  // The IMAP download stream has already handled transfer encoding and charset.
  // MailParser safely converts the supplied plain or HTML fragment into text and HTML.
  const source = Buffer.concat([
    Buffer.from(`Content-Type: ${contentType}; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n`, 'utf8'),
    content
  ]);
  const parsed = await simpleParser(source, { skipHtmlToText: false, skipImageLinks: false });
  const text = (parsed.text ?? '').replace(/\u0000/g, ' ').slice(0, MAX_TEXT_PART_BYTES);
  const html = typeof parsed.html === 'string' && parsed.html.trim() ? parsed.html.slice(0, MAX_TEXT_PART_BYTES) : undefined;
  return { text, html };
}

function asDate(value: FetchMessageObject['internalDate']): Date | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
}

function fromAddress(message: FetchMessageObject): string {
  const source = message.envelope?.from?.[0];
  if (!source) return '';
  return source.address || source.name || '';
}

function credentialsFor(account: AccountInput, resolveMicrosoftAccessToken: FetchAccountOptions['resolveMicrosoftAccessToken']): { user: string; pass?: string; accessToken?: string } {
  if (account.auth.type === 'app_password') return { user: account.email, pass: account.auth.secret };
  return { user: account.email, accessToken: resolveMicrosoftAccessToken(account.auth.sessionId, account.email) };
}

export interface FetchAccountResult {
  messages: EmailItem[];
  primaryCode?: CodeMatch;
}

export async function fetchAccountVerificationCode(account: AccountInput, options: FetchAccountOptions): Promise<FetchAccountResult> {
  const provider = PROVIDER_REGISTRY[account.provider];
  let client: ImapFlow | undefined;
  let lock: Awaited<ReturnType<ImapFlow['getMailboxLock']>> | undefined;
  const closeOnAbort = (): void => client?.close();
  options.signal.addEventListener('abort', closeOnAbort, { once: true });

  try {
    options.onProgress('authenticating');
    const auth = credentialsFor(account, options.resolveMicrosoftAccessToken);
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');

    client = new ImapFlow({
      host: provider.host,
      port: provider.port,
      secure: true,
      servername: provider.host,
      auth,
      disableAutoIdle: true,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      logger: false
    });

    options.onProgress('connecting');
    await client.connect();
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');

    lock = await client.getMailboxLock('INBOX', { readOnly: true, acquireTimeout: 10_000 });
    options.onProgress('searching');
    const threshold = options.lookbackMinutes > 0 ? new Date(Date.now() - options.lookbackMinutes * 60_000) : undefined;
    const searched = threshold
      ? (await client.search({ since: threshold }, { uid: true })) || []
      : (await client.search({ all: true }, { uid: true })) || [];
    const candidateUids = searched.slice(-MAX_CANDIDATE_METADATA).reverse();
    if (!candidateUids.length) return { messages: [] };

    const candidates: CandidateMessage[] = [];
    for await (const message of client.fetch(
      candidateUids,
      { uid: true, envelope: true, internalDate: true, size: true, bodyStructure: true },
      { uid: true }
    )) {
      const receivedAt = asDate(message.internalDate);
      if (!receivedAt || (threshold && receivedAt < threshold) || !message.uid || (message.size ?? 0) > MAX_MESSAGE_BYTES) continue;
      candidates.push({
        uid: message.uid,
        subject: message.envelope?.subject ?? '',
        from: fromAddress(message),
        receivedAt,
        size: message.size ?? 0,
        bodyStructure: message.bodyStructure
      });
    }

    options.onProgress('parsing');
    const emailItems: EmailItem[] = [];
    const matches: CodeMatch[] = [];
    for (const candidate of candidates.sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime()).slice(0, options.maxMessages)) {
      if (options.signal.aborted) throw new InboxMateError('CANCELLED');
      const textParts = selectTextParts(candidate.bodyStructure).slice(0, 2);
      let textBody = '';
      let htmlBody: string | undefined = undefined;

      for (const part of textParts) {
        const download = await client.download(candidate.uid.toString(), part.part, {
          uid: true,
          maxBytes: MAX_TEXT_PART_BYTES,
          chunkSize: 32 * 1024
        });
        const raw = await streamToBuffer(download.content as AsyncIterable<Buffer | string>, options.signal);
        const decoded = await decodeTextPart(raw, part.type);
        if (decoded.text) textBody += (textBody ? '\n\n' : '') + decoded.text;
        if (decoded.html && !htmlBody) htmlBody = decoded.html;
      }

      const match = extractVerificationCode({
        subject: candidate.subject,
        text: textBody,
        receivedAt: candidate.receivedAt,
        from: candidate.from
      });
      if (match) matches.push(match);

      const snippet = textBody.trim().replace(/\s+/g, ' ').slice(0, 300);
      emailItems.push({
        id: `${account.clientAccountId}-${candidate.uid}`,
        accountEmail: account.email,
        provider: account.provider,
        subject: candidate.subject || '(无主题)',
        from: candidate.from || account.email,
        receivedAt: candidate.receivedAt.toISOString(),
        snippet: snippet || '(无正文预览)',
        textBody: textBody.trim() || undefined,
        htmlBody: htmlBody || undefined,
        codeMatch: match
      });
    }

    const primaryCode = matches.sort((left, right) => right.score - left.score || Date.parse(right.receivedAt) - Date.parse(left.receivedAt))[0];
    return { messages: emailItems, primaryCode };
  } catch (error) {
    if (error instanceof InboxMateError) throw error;
    throw new InboxMateError(classifyImapError(error, options.signal.aborted));
  } finally {
    options.signal.removeEventListener('abort', closeOnAbort);
    try {
      lock?.release();
    } catch {
      // The connection may already be closed by cancellation.
    }
    if (client) {
      try {
        if (client.usable) await client.logout();
        else client.close();
      } catch {
        client.close();
      }
    }
  }
}

