import { createGoogleAuthProvider, refreshExternalAuth } from 'remix/auth'
import { scopesForPurpose, GOOGLE_REVOKED_GRANT_MESSAGE, type GooglePurpose } from '@conduits/config'

import { credentialStorePath, loadGoogleGrant, saveGoogleGrant, deleteGoogleGrant } from './google-credential-store.ts'

export type GoogleTokenResult =
  | { status: 'ok'; accessToken: string }
  // No grant at all under this name/purpose — never authorized, or a typo.
  | { status: 'missing' }
  // A grant exists but is expiring/expired with no refresh token to
  // renew it (shouldn't happen for a real Google grant — access_type:
  // 'offline' always issues one — kept distinct from 'missing' so a
  // caller can tell "never authorized" from "authorized but broken"
  // apart, even though both currently mean "can't proceed").
  | { status: 'no-refresh-token' }
  | { status: 'revoked' }
  | { status: 'refresh-failed'; error: unknown }

// Resolves a stored Google grant (see google-credential-store.ts) to a
// fresh, usable access token, refreshing it first if it's within 60s
// of expiring. Shared by the running gateway (runtime.ts, once per
// request) and the one-time `conduits sheets create` CLI step
// (cli.ts) so both take the exact same refresh/revocation path rather
// than two copies that could drift.
export async function getFreshGoogleAccessToken(name: string, purpose: GooglePurpose): Promise<GoogleTokenResult> {
  const storePath = credentialStorePath()
  const grant = loadGoogleGrant(storePath, name, purpose)
  if (!grant) return { status: 'missing' }

  const { tokens } = grant
  const expiringSoon = !tokens.expiresAt || tokens.expiresAt.getTime() - Date.now() < 60_000
  if (!expiringSoon) return { status: 'ok', accessToken: tokens.accessToken }

  if (!tokens.refreshToken) return { status: 'no-refresh-token' }

  // redirectUri is only consequential for the authorization/callback
  // steps (see google-auth-flow.ts) — refreshExternalAuth's own token-
  // refresh call never uses it, so a fixed placeholder here is
  // harmless. clientSecret may be genuinely absent for a Desktop-type
  // OAuth client (see StoredGoogleGrant's own doc); passed through as
  // an empty string since createGoogleAuthProvider's own options
  // require a string — if Google's refresh endpoint turns out to
  // reject an empty client_secret for a given project, that surfaces
  // as an ordinary 'refresh-failed', not a silent success.
  const provider = createGoogleAuthProvider({
    clientId: grant.clientId,
    clientSecret: grant.clientSecret ?? '',
    redirectUri: 'http://127.0.0.1/unused-during-refresh',
    scopes: [...scopesForPurpose(purpose)],
  })

  try {
    const refreshed = await refreshExternalAuth(provider, tokens)
    saveGoogleGrant(storePath, { ...grant, tokens: refreshed.tokens })
    return { status: 'ok', accessToken: refreshed.tokens.accessToken }
  } catch (err) {
    if (err instanceof Error && err.message === GOOGLE_REVOKED_GRANT_MESSAGE) {
      deleteGoogleGrant(storePath, name, purpose)
      return { status: 'revoked' }
    }
    return { status: 'refresh-failed', error: err }
  }
}
