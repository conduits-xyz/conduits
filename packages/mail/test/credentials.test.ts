import { generateKeyPairSync, createVerify } from 'node:crypto'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { fixedToken, googleServiceAccount, retryAfterSeconds } from '../credentials.ts'
import { fakeFetch, json, NOW } from './helpers.ts'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const KEY = { clientEmail: 'mailer@project.iam.example', privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() }
const TOKEN_URL = 'https://oauth.example/token'

function account(answer: (index: number) => Response | Promise<Response>) {
  let now = NOW
  const fake = fakeFetch((_url, _init, index) => answer(index))
  const credential = googleServiceAccount({ tokenUrl: TOKEN_URL, fetch: fake.fetch, now: () => now, key: KEY, subject: 'noreply@example.com', scopes: ['https://www.googleapis.com/auth/gmail.send'] })
  return { credential, requests: fake.requests, setNow: (at: number) => void (now = at) }
}

const issued = (index: number) => json({ access_token: `token-${index + 1}`, expires_in: 3600, token_type: 'Bearer' })

describe('fixedToken', () => {
  it('is always the same token', async () => {
    assert.deepEqual(await fixedToken('t').token(), { ok: true, token: 't' })
  })
})

describe('googleServiceAccount', () => {
  it('exchanges a JWT signed with the key, for the subject and scopes, at the token endpoint', async () => {
    const { credential, requests } = account(issued)
    assert.deepEqual(await credential.token(), { ok: true, token: 'token-1' })

    const form = new URLSearchParams(String(requests[0]!.init!.body))
    assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer')
    const [header, claims, signature] = form.get('assertion')!.split('.')
    assert.deepEqual(JSON.parse(Buffer.from(header!, 'base64url').toString()), { alg: 'RS256', typ: 'JWT' })
    assert.deepEqual(JSON.parse(Buffer.from(claims!, 'base64url').toString()), {
      iss: KEY.clientEmail,
      sub: 'noreply@example.com',
      scope: 'https://www.googleapis.com/auth/gmail.send',
      aud: TOKEN_URL,
      iat: NOW / 1000,
      exp: NOW / 1000 + 3600,
    })
    assert.ok(createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature!, 'base64url')))
  })

  it('keeps the token until a minute before it expires, and fetches a new one from then on', async () => {
    const { credential, requests, setNow } = account(issued)
    await credential.token()
    setNow(NOW + 3600_000 - 60_000 - 1)
    assert.deepEqual(await credential.token(), { ok: true, token: 'token-1' })
    setNow(NOW + 3600_000 - 60_000)
    assert.deepEqual(await credential.token(), { ok: true, token: 'token-2' })
    assert.equal(requests.length, 2)
  })

  it('fetches a new token after forget(), and shares one fetch between concurrent callers', async () => {
    const { credential, requests } = account(issued)
    const [a, b] = await Promise.all([credential.token(), credential.token()])
    assert.deepEqual([a, b], [{ ok: true, token: 'token-1' }, { ok: true, token: 'token-1' }])
    credential.forget()
    assert.deepEqual(await credential.token(), { ok: true, token: 'token-2' })
    assert.equal(requests.length, 2)
  })

  it('reports a refused assertion as auth_failed, and an outage as unavailable with its Retry-After', async () => {
    const refused = account(() => json({ error: 'unauthorized_client', error_description: 'Client is unauthorized' }, 401))
    assert.equal((await refused.credential.token() as { code: string }).code, 'auth_failed')

    const busy = account(() => json({ error: 'busy' }, 503, { 'retry-after': '12' }))
    assert.deepEqual(await busy.credential.token(), { ok: false, code: 'unavailable', retryAfter: 12, cause: 'token endpoint 503: busy' })

    const down = account(() => Promise.reject(new TypeError('fetch failed')))
    assert.deepEqual(await down.credential.token(), { ok: false, code: 'unavailable', retryAfter: 30, cause: 'token endpoint: fetch failed' })
  })
})

describe('retryAfterSeconds', () => {
  it('reads seconds or an HTTP date, defaulting to 30', () => {
    assert.equal(retryAfterSeconds('7', NOW), 7)
    assert.equal(retryAfterSeconds(new Date(NOW + 9500).toUTCString(), NOW), 9)
    assert.equal(retryAfterSeconds(null, NOW), 30)
    assert.equal(retryAfterSeconds('soon', NOW), 30)
  })
})
