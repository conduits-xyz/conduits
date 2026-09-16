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

export interface GoogleTokenOptions {
  // Called instead of the default deleteGoogleGrant when Google
  // confirms a grant dead. The default (when omitted) deletes the
  // grant outright — appropriate for a CLI-authorized, single-operator
  // credential nothing else is tracking generations for. A caller that
  // does track credential generations (see StoredGoogleGrant's own
  // doc) should pass this instead, to tombstone the grant in place —
  // preserving its generation so that same generation, seen again
  // later, is recognizable as already-dead rather than reinstalled.
  onRevoked?: (storePath: string, name: string, purpose: GooglePurpose) => void
}

// Resolves a stored Google grant (see google-credential-store.ts) to a
// fresh, usable access token, refreshing it first if it's within 60s
// of expiring. Shared by every runtime that operates a Google-backed
// conduit — a self-hosted gateway process, a managed one, or the
// one-time `conduits sheets create` CLI step — so all three take the
// exact same refresh/revocation path rather than copies that could
// drift.
export async function getFreshGoogleAccessToken(
  name: string,
  purpose: GooglePurpose,
  options: GoogleTokenOptions = {},
): Promise<GoogleTokenResult> {
  const storePath = credentialStorePath()
  const grant = loadGoogleGrant(storePath, name, purpose)
  if (!grant) return { status: 'missing' }

  const { tokens } = grant
  const expiringSoon = !tokens.expiresAt || tokens.expiresAt.getTime() - Date.now() < 60_000
  if (!expiringSoon) return { status: 'ok', accessToken: tokens.accessToken }

  if (!tokens.refreshToken) return { status: 'no-refresh-token' }

  // redirectUri is only consequential for the authorization/callback
  // steps (see google-auth-flow.ts in services/gateway) — refreshExternalAuth's
  // own token-refresh call never uses it, so a fixed placeholder here
  // is harmless. clientSecret may be genuinely absent for a Desktop-type
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
    // Spreads `...grant` first — an ordinary refresh only ever touches
    // `tokens`, never `generation`/`status`, both of which (when
    // present) carry forward unchanged.
    saveGoogleGrant(storePath, { ...grant, tokens: refreshed.tokens })
    return { status: 'ok', accessToken: refreshed.tokens.accessToken }
  } catch (err) {
    if (err instanceof Error && err.message === GOOGLE_REVOKED_GRANT_MESSAGE) {
      if (options.onRevoked) options.onRevoked(storePath, name, purpose)
      else deleteGoogleGrant(storePath, name, purpose)
      return { status: 'revoked' }
    }
    return { status: 'refresh-failed', error: err }
  }
}
