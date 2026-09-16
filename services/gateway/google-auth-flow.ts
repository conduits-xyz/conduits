import * as http from 'node:http'
import { randomBytes, createHash } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { OAuthTokens } from 'remix/auth'

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000

function base64url(input: Buffer): string {
  return input.toString('base64url')
}

function generatePkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  return { verifier, challenge }
}

export interface GoogleAuthorizeOptions {
  clientId: string
  clientSecret?: string
  scopes: readonly string[]
  authorizationParams: Record<string, string>
}

export interface GoogleAuthorizeResult {
  tokens: OAuthTokens
  email?: string
}

// Waits for exactly one /callback request on the given loopback
// server, validating `state`, then resolves with the authorization
// code (or rejects on a mismatch, an error= param, or the timeout).
// The server is always closed before this settles, one way or another.
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

async function fetchEmailBestEffort(accessToken: string): Promise<string | undefined> {
  try {
    const response = await fetch(USERINFO_ENDPOINT, { headers: { authorization: `Bearer ${accessToken}` } })
    if (!response.ok) return undefined
    const body = (await response.json()) as { email?: string }
    return body.email
  } catch {
    return undefined
  }
}

// The whole "installed app" OAuth 2.0 dance, hand-rolled: remix/auth's
// public API (startExternalAuth/finishExternalAuth) needs a live
// RequestContext with session storage for its own PKCE/state
// transaction — shaped for a web app, not a bare CLI process — and its
// lower-level building blocks (exchangeAuthorizationCode et al.,
// @remix-run/auth's provider.ts) aren't part of that package's public
// exports. This instead talks to Google's own documented, stable
// authorization-code + PKCE endpoints directly — the same protocol
// contract those internals wrap. Refreshing an already-authorized
// grant does NOT need this — see runtime.ts, which reuses
// createGoogleAuthProvider + refreshExternalAuth directly, since that
// part of remix/auth's API needs no session.
export async function authorizeGoogle(options: GoogleAuthorizeOptions): Promise<GoogleAuthorizeResult> {
  const { verifier, challenge } = generatePkce()
  const state = base64url(randomBytes(16))

  const server = http.createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const redirectUri = `http://127.0.0.1:${port}/callback`

  const authUrl = new URL(AUTHORIZATION_ENDPOINT)
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

  const tokenResponse = await fetch(TOKEN_ENDPOINT, {
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
    expiresAt: body.expires_in ? new Date(Date.now() + body.expires_in * 1000) : undefined,
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

  const email = await fetchEmailBestEffort(tokens.accessToken)
  return { tokens, email }
}
