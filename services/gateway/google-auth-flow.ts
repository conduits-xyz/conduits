import * as http from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { OAuthTokens } from 'remix/auth'

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000

function base64url(input: Buffer): string {
  return input.toString('base64url')
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

// Google's OAuth endpoints (providers.ts).
export interface GoogleAuthEndpoints {
  authorizationUrl: string
  tokenUrl: string
  userinfoUrl: string
  fetch: typeof fetch
}

export interface GoogleAuthorizeOptions {
  endpoints: GoogleAuthEndpoints
  now: () => number
  clientId: string
  clientSecret?: string
  scopes: readonly string[]
  authorizationParams: Record<string, string>
}

export interface GoogleAuthorizeResult {
  tokens: OAuthTokens
  email?: string
}

// Waits for one /callback request on the loopback server, checks
// `state`, and resolves with the authorization code; rejects on a
// mismatch, an error= parameter or the timeout. Closes the server
// either way.
function waitForCallback(server: http.Server, expectedState: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error(`Timed out waiting for the Google OAuth callback after ${CALLBACK_TIMEOUT_MS / 1000}s`))
    }, CALLBACK_TIMEOUT_MS)

    function settle(fn: () => void): void {
      clearTimeout(timeout)
      server.close()
      fn()
    }

    server.on('request', (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }

      const error = url.searchParams.get('error')
      if (error) {
        res.writeHead(200, { 'content-type': 'text/html' }).end(`<p>Authorization failed: ${error}. You can close this tab.</p>`)
        settle(() => reject(new Error(`Google returned an authorization error: ${error}`)))
        return
      }

      const returnedState = url.searchParams.get('state')
      const code = url.searchParams.get('code')
      if (returnedState !== expectedState || !code) {
        res
          .writeHead(400, { 'content-type': 'text/html' })
          .end('<p>Invalid callback (state mismatch or missing code). You can close this tab.</p>')
        settle(() => reject(new Error('Google OAuth callback failed state validation')))
        return
      }

      res.writeHead(200, { 'content-type': 'text/html' }).end('<p>Authorized. You can close this tab and return to the terminal.</p>')
      settle(() => resolve(code))
    })
  })
}

async function fetchEmailBestEffort(endpoints: GoogleAuthEndpoints, accessToken: string): Promise<string | undefined> {
  try {
    const response = await endpoints.fetch(endpoints.userinfoUrl, { headers: { authorization: `Bearer ${accessToken}` } })
    if (!response.ok) return undefined
    const body = (await response.json()) as { email?: string }
    return body.email
  } catch {
    return undefined
  }
}

// The installed-app OAuth flow (authorization code with PKCE) against
// Google's endpoints directly. remix/auth's startExternalAuth and
// finishExternalAuth need a request context with sessions, and its
// lower-level functions aren't exported. Refreshing is
// refreshGoogleTokens in @conduits/config.
export async function authorizeGoogle(options: GoogleAuthorizeOptions): Promise<GoogleAuthorizeResult> {
  const { verifier, challenge } = generatePkce()
  const state = base64url(randomBytes(16))

  const server = http.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const redirectUri = `http://127.0.0.1:${port}/callback`

  const authUrl = new URL(options.endpoints.authorizationUrl)
  authUrl.searchParams.set('client_id', options.clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', options.scopes.join(' '))
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('code_challenge', challenge)
  authUrl.searchParams.set('code_challenge_method', 'S256')
  for (const [key, value] of Object.entries(options.authorizationParams)) {
    authUrl.searchParams.set(key, value)
  }

  console.log('\nOpen this URL in a browser to authorize:\n')
  console.log(authUrl.toString())
  console.log('\nWaiting for the redirect back to this process...\n')

  const code = await waitForCallback(server, state)

  const tokenResponse = await options.endpoints.fetch(options.endpoints.tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: options.clientId,
      ...(options.clientSecret ? { client_secret: options.clientSecret } : {}),
      code_verifier: verifier,
    }),
  })

  const body = (await tokenResponse.json()) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    token_type?: string
    id_token?: string
    error?: string
    error_description?: string
  }

  if (!tokenResponse.ok || !body.access_token) {
    throw new Error(
      `Google token exchange failed: ${body.error ?? tokenResponse.status}${body.error_description ? ` — ${body.error_description}` : ''}`,
    )
  }

  const tokens: OAuthTokens = {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    tokenType: body.token_type,
    expiresAt: body.expires_in ? new Date(options.now() + body.expires_in * 1000) : undefined,
    scope: body.scope ? body.scope.split(' ') : undefined,
    idToken: body.id_token,
  }

  if (!tokens.refreshToken) {
    console.warn(
      '\nWarning: Google did not return a refresh token. This usually happens when this exact client already ' +
        "has a live grant for this account/scope. Clear this app's access on the Google account's own " +
        '"Third-party apps & services" page and re-run this command to force a fresh consent.\n',
    )
  }

  const email = await fetchEmailBestEffort(options.endpoints, tokens.accessToken)
  return { tokens, email }
}
