// Refreshing a Google access token, for every runtime that holds Google
// grants: the self-hosted gateway's credential store and the hosted
// dashboard. The token endpoint and fetch are injected, so a runtime can
// point them at an emulator.

export interface GoogleTokenEndpoint {
  tokenUrl: string
  fetch: typeof fetch
}

export interface GoogleClient {
  clientId: string
  // A Desktop client may have no secret; Google then expects none sent.
  clientSecret?: string
}

// The members a refresh reads and writes; a stored token set may carry
// more (scope, idToken), which a refresh keeps.
export interface RefreshableTokens {
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
}

export type GoogleRefreshResult<T extends RefreshableTokens> =
  | { status: 'ok'; tokens: T }
  // invalid_grant: the refresh token will never work again. Google
  // returns it for a revoked grant, a changed password (Gmail scopes),
  // six months unused, and the 7-day limit of a Testing-status project.
  | { status: 'revoked' }
  | { status: 'refresh-failed'; error: Error }

// `now` is the instant the caller is acting at; the new expiry counts
// from it.
export async function refreshGoogleTokens<T extends RefreshableTokens>(
  endpoint: GoogleTokenEndpoint,
  client: GoogleClient,
  tokens: T & { refreshToken: string },
  now: number,
): Promise<GoogleRefreshResult<T>> {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken, client_id: client.clientId })
  if (client.clientSecret) body.set('client_secret', client.clientSecret)

  let response: Response
  let data: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown; error?: unknown; error_description?: unknown }
  try {
    response = await endpoint.fetch(endpoint.tokenUrl, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body,
    })
    data = (await response.json()) as typeof data
  } catch (error) {
    return { status: 'refresh-failed', error: error instanceof Error ? error : new Error(String(error)) }
  }

  if (data.error === 'invalid_grant') return { status: 'revoked' }
  if (!response.ok || typeof data.access_token !== 'string' || data.access_token === '') {
    const reason = typeof data.error_description === 'string' ? data.error_description : typeof data.error === 'string' ? data.error : `HTTP ${response.status}`
    return { status: 'refresh-failed', error: new Error(`Google token refresh failed: ${reason}`) }
  }
  return {
    status: 'ok',
    tokens: {
      ...tokens,
      accessToken: data.access_token,
      refreshToken: typeof data.refresh_token === 'string' ? data.refresh_token : tokens.refreshToken,
      expiresAt: typeof data.expires_in === 'number' ? new Date(now + data.expires_in * 1000) : undefined,
    },
  }
}
