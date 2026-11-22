/**
 * Integration Billing Config
 *
 * Configure who pays for each integration's API calls.
 *
 * - 'developer': The app owner pays (default).
 * - 'user': The calling user pays.
 *
 * InterfaceLab Workshop calls its three integrations ONLY from server actions
 * (src/server/review.ts, docs.ts, notify.ts), which require sign-in, verify
 * ownership and claim a daily quota before spending credits. The browser
 * proxy at /api/integrations/* is therefore closed for every integration
 * unless it is explicitly marked `browser: true` here (see
 * src/server/http-routes.ts) — otherwise any signed-in user could call any
 * catalog endpoint on the owner's credits and bypass those quotas.
 *
 * IMPORTANT: any integration backed by per-user connected accounts (Google,
 * Composio) must be 'user' — the api-worker resolves the account from the
 * JWT subject.
 */

export const integrations: Record<
  string,
  { billing: 'developer' | 'user'; anonymous?: boolean; browser?: boolean }
> = {
  anthropic: { billing: 'developer' },
  exa: { billing: 'developer' },
  email: { billing: 'developer' },
  google: { billing: 'user' },
  composio: { billing: 'user' },
}
