import { createGoogleAuthProvider, refreshExternalAuth } from 'remix/auth'
import { scopesForPurpose, GOOGLE_REVOKED_GRANT_MESSAGE, type GooglePurpose } from '@conduits/config'

import { credentialStorePath, loadGoogleGrant, saveGoogleGrant, deleteGoogleGrant } from './google-credential-store.ts'

export type GoogleTokenResult =
  | { status: 'ok'; accessToken: string }
  // No grant under this name and purpose.
  | { status: 'missing' }
  // The grant is expiring and has no refresh token. Google always issues
  // one for access_type 'offline'; this is kept apart from 'missing' so
  // a caller can tell the two cases apart.
  | { status: 'no-refresh-token' }
  | { status: 'revoked' }
  | { status: 'refresh-failed'; error: unknown }

export interface GoogleTokenOptions {
  // Called instead of deleteGoogleGrant when Google rejects the grant.
  // Callers that track generations pass markGoogleGrantInvalid here, to
  // keep the grant (see StoredGoogleGrant).
  onRevoked?: (storePath: string, name: string, purpose: GooglePurpose) => void
}

// A stored grant's access token, refreshed first if it expires within
// 60s. Used by every runtime with Google-backed conduits and by
// `conduits sheets create`, so all take the same refresh and revocation
// path.
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

  // redirectUri isn't used when refreshing (only in
  // google-auth-flow.ts's authorization steps), so a placeholder is
  // fine. A Desktop client may have no secret; '' is passed because the
  // option is a string, and a rejection would be a 'refresh-failed'.
  const provider = createGoogleAuthProvider({
    clientId: grant.clientId,
    clientSecret: grant.clientSecret ?? '',
    redirectUri: 'http://127.0.0.1/unused-during-refresh',
    scopes: [...scopesForPurpose(purpose)],
  })

  try {
    const refreshed = await refreshExternalAuth(provider, tokens)
    // A refresh changes only `tokens`; generation and status carry over.
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
