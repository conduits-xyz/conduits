import { refreshGoogleTokens, type GooglePurpose, type GoogleTokenEndpoint } from '@conduits/config'

import { loadGoogleGrant, saveGoogleGrant, deleteGoogleGrant } from './google-credential-store.ts'

export type GoogleTokenResult =
  | { status: 'ok'; accessToken: string }
  // No grant under this name and purpose.
  | { status: 'missing' }
  // The grant is expiring and has no refresh token. Google always issues
  // one for access_type 'offline'; this is kept apart from 'missing' so
  // a caller can tell the two cases apart.
  | { status: 'no-refresh-token' }
  | { status: 'revoked' }
  | { status: 'refresh-failed'; error: Error }

export interface GoogleTokenOptions {
  endpoint: GoogleTokenEndpoint
  now: () => number
  // Called instead of deleteGoogleGrant when Google rejects the grant.
  // Callers that track generations pass markGoogleGrantInvalid here, to
  // keep the grant (see StoredGoogleGrant).
  onRevoked?: (storePath: string, name: string, purpose: GooglePurpose) => void
}

// The access token of the grant stored at `storePath` under this name
// and purpose, refreshed first if it expires within 60s. Used by every runtime with Google-backed conduits and by
// `conduits sheets create`, so all take the same refresh and revocation
// path.
export async function getFreshGoogleAccessToken(
  storePath: string,
  name: string,
  purpose: GooglePurpose,
  options: GoogleTokenOptions,
): Promise<GoogleTokenResult> {
  const grant = loadGoogleGrant(storePath, name, purpose)
  if (!grant) return { status: 'missing' }

  const { tokens } = grant
  const now = options.now()
  const expiringSoon = !tokens.expiresAt || tokens.expiresAt.getTime() - now < 60_000
  if (!expiringSoon) return { status: 'ok', accessToken: tokens.accessToken }

  const { refreshToken } = tokens
  if (!refreshToken) return { status: 'no-refresh-token' }

  const client = { clientId: grant.clientId, clientSecret: grant.clientSecret }
  const result = await refreshGoogleTokens(options.endpoint, client, { ...tokens, refreshToken }, now)
  switch (result.status) {
    case 'ok':
      // A refresh changes only `tokens`; generation and status carry over.
      saveGoogleGrant(storePath, { ...grant, tokens: result.tokens })
      return { status: 'ok', accessToken: result.tokens.accessToken }
    case 'revoked':
      if (options.onRevoked) options.onRevoked(storePath, name, purpose)
      else deleteGoogleGrant(storePath, name, purpose)
      return { status: 'revoked' }
    case 'refresh-failed':
      return result
  }
}
