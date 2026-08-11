import type { AccountInput, EngineType } from '../shared/types.js';
import { providerForEmail } from './providers.js';

/**
 * Intelligent Engine Router for Inbox-Mate
 * Evaluates account domain, protocol, and authentication type to route to:
 * - 'microsoft_graph': Microsoft OAuth / RefreshToken / Graph API
 * - 'imap_pop3': Standard IMAP / POP3 protocol client
 * - 'web_rpa': Headless Playwright Chrome Web RPA (for Mail.com / email.com etc.)
 */
export function routeAccountEngine(account: AccountInput): EngineType {
  // 1. Explicit custom protocol specified by user
  if (account.customProtocol === 'pop3' || account.customProtocol === 'imap') {
    return 'imap_pop3';
  }

  // 2. OAuth Session or Refresh Token -> Microsoft Graph
  if (account.auth.type === 'oauth_session' || account.auth.type === 'refresh_token') {
    return 'microsoft_graph';
  }

  // 3. Provider lookup based on domain
  const provider = providerForEmail(account.email);
  if (provider.engineType === 'web_rpa') {
    return 'web_rpa';
  }

  if (provider.id === 'microsoft') {
    return 'microsoft_graph';
  }

  return 'imap_pop3';
}
