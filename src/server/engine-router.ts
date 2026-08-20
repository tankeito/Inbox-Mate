import type { AccountInput, EngineType } from '../shared/types.js';
import { providerForEmail } from './providers.js';

export type EnginePreference = 'auto' | 'web_rpa' | 'imap_pop3';

/**
 * Intelligent Engine Router for Inbox-Mate
 * Evaluates account domain, protocol, authentication type, and Token/Request preference to route to:
 * - 'microsoft_graph': Microsoft OAuth / RefreshToken / Graph API
 * - 'imap_pop3': Standard IMAP / POP3 protocol client
 * - 'web_rpa': Headless Playwright Chrome Web RPA (for Mail.com / email.com etc.)
 */
export function routeAccountEngine(
  account: AccountInput,
  enginePreference?: EnginePreference
): EngineType {
  const effectivePref = enginePreference || account.enginePreference;

  // 1. Explicit Engine Preference Override from Token or Request
  if (effectivePref === 'imap_pop3') {
    return 'imap_pop3';
  }
  if (effectivePref === 'web_rpa') {
    return 'web_rpa';
  }

  // 2. Explicit custom protocol specified by user
  if (account.customProtocol === 'pop3' || account.customProtocol === 'imap') {
    return 'imap_pop3';
  }

  // 3. OAuth Session or Refresh Token -> Microsoft Graph
  if (account.auth.type === 'oauth_session' || account.auth.type === 'refresh_token') {
    return 'microsoft_graph';
  }

  // 4. OffiLive always uses Web RPA
  const provider = providerForEmail(account.email);
  if (provider.id === 'offilive') {
    return 'web_rpa';
  }

  if (provider.id === 'microsoft') {
    return 'microsoft_graph';
  }

  // 5. For Mail.com and other standard providers in 'auto' mode:
  // Route to 'imap_pop3' as the primary intelligent probe channel.
  // If IMAP is supported by the account (enabled in settings/premium), it completes instantly via IMAP.
  // If IMAP is disabled, imap-client automatically and seamlessly falls back to Chrome Web RPA!
  return 'imap_pop3';
}
