import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { refreshGoogleTokens } from '../google-oauth.ts'

// refreshGoogleTokens against a token endpoint that answers as given.

const NOW = Date.parse('2026-10-05T12:00:00.000Z')
const TOKENS = { accessToken: 'old', refreshToken: 'refresh', scope: ['email'] }

function endpoint(answer: () => Response | Promise<Response>) {
  const requests: URLSearchParams[] = []
  const fetchImpl = (async (_input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    requests.push(new URLSearchParams(String(init?.body)))
    return answer()
  }) as typeof fetch
  return { endpoint: { tokenUrl: 'https://oauth.example/token', fetch: fetchImpl }, requests }
}

const json = (body: object, status = 200) => Response.json(body, { status })

describe('refreshGoogleTokens', () => {
  it('returns the new access token, expiring from the given instant, keeping the other members', async () => {
    const { endpoint: e, requests } = endpoint(() => json({ access_token: 'new', expires_in: 3600 }))
    const result = await refreshGoogleTokens(e, { clientId: 'id', clientSecret: 'secret' }, TOKENS, NOW)
    assert.deepEqual(result, {
      status: 'ok',
      tokens: { accessToken: 'new', refreshToken: 'refresh', scope: ['email'], expiresAt: new Date('2026-10-05T13:00:00.000Z') },
    })
    assert.deepEqual(Object.fromEntries(requests[0]!), { grant_type: 'refresh_token', refresh_token: 'refresh', client_id: 'id', client_secret: 'secret' })
  })

  it('keeps a rotated refresh token, and sends no secret for a client without one', async () => {
    const { endpoint: e, requests } = endpoint(() => json({ access_token: 'new', refresh_token: 'rotated', expires_in: 60 }))
    const result = await refreshGoogleTokens(e, { clientId: 'desktop' }, TOKENS, NOW)
    assert.equal(result.status === 'ok' && result.tokens.refreshToken, 'rotated')
    assert.equal(requests[0]!.has('client_secret'), false)
  })

  it('reports invalid_grant as revoked', async () => {
    const { endpoint: e } = endpoint(() => json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400))
    assert.deepEqual(await refreshGoogleTokens(e, { clientId: 'id' }, TOKENS, NOW), { status: 'revoked' })
  })

  it('reports any other answer, or no answer, as a failure that leaves the grant alone', async () => {
    for (const answer of [
      () => json({ error: 'invalid_client', error_description: 'Unauthorized client.' }, 401),
      () => new Response('', { status: 503 }),
      () => json({}),
      () => Promise.reject(new TypeError('fetch failed')),
    ]) {
      const result = await refreshGoogleTokens(endpoint(answer).endpoint, { clientId: 'id' }, TOKENS, NOW)
      assert.equal(result.status, 'refresh-failed')
    }
  })
})
