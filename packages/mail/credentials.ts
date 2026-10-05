import { createSign } from 'node:crypto'

import { DEFAULT_RETRY_AFTER_SECONDS, type Credential, type TokenResult } from './types.ts'

// Ways an account gets the bearer token its transport sends. Any
// credential works with either transport.

// A token that doesn't expire, such as a Fastmail API token.
export function fixedToken(token: string): Credential {
  return {
    token: async () => ({ ok: true, token }),
    forget() {},
  }
}

// Seconds from a Retry-After header (seconds or an HTTP date), or the
// default. `now` is the instant the answer is read at.
export function retryAfterSeconds(header: string | null, now: number): number {
  if (!header) return DEFAULT_RETRY_AFTER_SECONDS
  if (/^\d+$/.test(header)) return Number(header)
  const at = Date.parse(header)
  return Number.isNaN(at) ? DEFAULT_RETRY_AFTER_SECONDS : Math.max(0, Math.ceil((at - now) / 1000))
}

// The fields used from a service account's JSON key file.
export interface ServiceAccountKey {
  // `client_email`
  clientEmail: string
  // `private_key`, PEM
  privateKey: string
}

export interface GoogleServiceAccountOptions {
  tokenUrl: string
  fetch: typeof fetch
  now: () => number
  key: ServiceAccountKey
  // The Workspace user to act as (domain-wide delegation): the sender.
  subject: string
  scopes: string[]
}

// A token is fetched again this long before it expires.
const EARLY_REFRESH_MS = 60_000
const ASSERTION_SECONDS = 3600

const base64url = (value: string | Buffer) => Buffer.from(value).toString('base64url')

// A Google service account with domain-wide delegation, acting as
// `subject`: a signed JWT (RFC 7523) exchanged at the token endpoint for
// an access token, which is kept until shortly before it expires. A
// Workspace admin must have authorized the account for `scopes`.
export function googleServiceAccount(options: GoogleServiceAccountOptions): Credential {
  let cached: { token: string; refreshAt: number } | null = null
  let pending: Promise<TokenResult> | null = null

  function assertion(now: number): string {
    const iat = Math.floor(now / 1000)
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claims = base64url(
      JSON.stringify({ iss: options.key.clientEmail, sub: options.subject, scope: options.scopes.join(' '), aud: options.tokenUrl, iat, exp: iat + ASSERTION_SECONDS }),
    )
    const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(options.key.privateKey)
    return `${header}.${claims}.${base64url(signature)}`
  }

  async function fetchToken(now: number): Promise<TokenResult> {
    let response: Response
    let body: { access_token?: unknown; expires_in?: unknown; error?: unknown; error_description?: unknown }
    try {
      response = await options.fetch(options.tokenUrl, {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: assertion(now) }),
      })
      body = (await response.json()) as typeof body
    } catch (error) {
      return { ok: false, code: 'unavailable', retryAfter: DEFAULT_RETRY_AFTER_SECONDS, cause: `token endpoint: ${error instanceof Error ? error.message : String(error)}` }
    }
    const cause = `token endpoint ${response.status}: ${typeof body.error_description === 'string' ? body.error_description : String(body.error ?? '')}`
    if (response.status === 400 || response.status === 401) return { ok: false, code: 'auth_failed', cause }
    if (!response.ok || typeof body.access_token !== 'string' || typeof body.expires_in !== 'number') {
      return { ok: false, code: 'unavailable', retryAfter: retryAfterSeconds(response.headers.get('retry-after'), now), cause }
    }
    cached = { token: body.access_token, refreshAt: now + body.expires_in * 1000 - EARLY_REFRESH_MS }
    return { ok: true, token: body.access_token }
  }

  return {
    async token() {
      const now = options.now()
      if (cached && now < cached.refreshAt) return { ok: true, token: cached.token }
      // Concurrent sends share one fetch.
      pending ??= fetchToken(now).finally(() => {
        pending = null
      })
      return pending
    },
    forget() {
      cached = null
    },
  }
}
