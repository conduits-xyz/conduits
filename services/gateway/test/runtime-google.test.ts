import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as assert from 'remix/assert'
import { describe, it, afterEach } from 'remix/test'

import type { ConduitConfig } from '@conduits/gateway'
import { gatewayServiceRuntime } from '../runtime.ts'
import { loadGoogleGrant, saveGoogleGrant } from '@conduits/credential-store'
import type { StoredGoogleGrant } from '@conduits/credential-store'

// Mock the token endpoint, drive the real refresh path — proving this
// runtime's getCredential()/invalidateCredential() go through the
// exact same createGoogleAuthProvider + refreshExternalAuth call,
// persisting to a local file instead of a database row.
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

function mockTokenEndpoint(handler: () => Response): () => void {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === TOKEN_ENDPOINT) return handler()
    // The userinfo best-effort fetch (google-auth-flow.ts) isn't
    // exercised via getCredential()/invalidateCredential() at all —
    // any other URL here is a real test bug, not a legitimate call.
    throw new Error(`unexpected fetch in runtime-google.test.ts: ${url}`)
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function tempStorePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduits-runtime-google-test-'))
  return path.join(dir, 'credentials.json')
}

function conduitConfig(overrides: Partial<ConduitConfig> = {}): ConduitConfig {
  return {
    curi: 'newsletter',
    allowlist: [],
    racm: ['POST'],
    throttle: false,
    tokenRequiredMethods: [],
    bearerTokenHash: null,
    suriType: 'googleSheets',
    suriObjectKey: '1AbC',
    suriConfig: {},
    hiddenFormField: [],
    credentialRef: 'google:personal',
    ...overrides,
  }
}

function expiredGrant(overrides: Partial<StoredGoogleGrant> = {}): StoredGoogleGrant {
  return {
    name: 'personal',
    purpose: 'sheets',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    tokens: {
      accessToken: 'stale-access-token',
      refreshToken: 'real-refresh-token',
      expiresAt: new Date(Date.now() - 1000),
    },
    ...overrides,
  }
}

describe('gatewayServiceRuntime.getCredential — googleSheets/gmail', () => {
  let restore: (() => void) | undefined
  afterEach(() => {
    restore?.()
    restore = undefined
    delete process.env.CONDUITS_CREDENTIAL_STORE_PATH
  })

  it('returns the cached access token directly when it is not expiring soon (no refresh call at all)', async () => {
    const storePath = tempStorePath()
    process.env.CONDUITS_CREDENTIAL_STORE_PATH = storePath
    saveGoogleGrant(storePath, expiredGrant({ tokens: { accessToken: 'fresh-token', expiresAt: new Date(Date.now() + 3_600_000) } }))

    // No mockTokenEndpoint installed — any fetch call at all throws,
    // via the real, unmocked global fetch hitting a real network call
    // this test never wants to make. If getCredential() wrongly
    // refreshed, this test would hang/fail on a real network attempt.
    const token = await gatewayServiceRuntime.getCredential(conduitConfig())
    assert.equal(token, 'fresh-token')
  })

  it('refreshes and persists a new access token when the stored one is expiring, for suriType googleSheets (purpose sheets)', async () => {
    const storePath = tempStorePath()
    process.env.CONDUITS_CREDENTIAL_STORE_PATH = storePath
    saveGoogleGrant(storePath, expiredGrant({ purpose: 'sheets' }))
    restore = mockTokenEndpoint(() => jsonResponse({ access_token: 'fresh-access-token', expires_in: 3600, token_type: 'Bearer' }))

    const token = await gatewayServiceRuntime.getCredential(conduitConfig({ suriType: 'googleSheets' }))
    assert.equal(token, 'fresh-access-token')

    const reloaded = loadGoogleGrant(storePath, 'personal', 'sheets')
    assert.equal(reloaded?.tokens.accessToken, 'fresh-access-token')
    assert.ok((reloaded?.tokens.expiresAt?.getTime() ?? 0) > Date.now() + 60_000)
  })

  it('derives purpose "gmail" for suriType gmail — a grant saved only under "sheets" is not found', async () => {
    const storePath = tempStorePath()
    process.env.CONDUITS_CREDENTIAL_STORE_PATH = storePath
    saveGoogleGrant(storePath, expiredGrant({ purpose: 'sheets' }))

    const token = await gatewayServiceRuntime.getCredential(conduitConfig({ suriType: 'gmail', suriObjectKey: '' }))
    assert.equal(token, null, 'a sheets-purpose grant must not satisfy a gmail-purpose lookup')
  })

  it('deletes the local grant when Google reports the grant as expired or revoked', async () => {
    const storePath = tempStorePath()
    process.env.CONDUITS_CREDENTIAL_STORE_PATH = storePath
    saveGoogleGrant(storePath, expiredGrant())
    restore = mockTokenEndpoint(() =>
      jsonResponse({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400),
    )

    const token = await gatewayServiceRuntime.getCredential(conduitConfig())
    assert.equal(token, null)
    assert.equal(loadGoogleGrant(storePath, 'personal', 'sheets'), null, 'a confirmed-dead grant must be removed, not left to fail forever')
  })

  it('does not delete the grant on an ambiguous or transient failure', async () => {
    const storePath = tempStorePath()
    process.env.CONDUITS_CREDENTIAL_STORE_PATH = storePath
    saveGoogleGrant(storePath, expiredGrant())
    restore = mockTokenEndpoint(() => new Response('', { status: 503 }))

    const token = await gatewayServiceRuntime.getCredential(conduitConfig())
    assert.equal(token, null)
    assert.ok(loadGoogleGrant(storePath, 'personal', 'sheets'), 'a transient failure must not force a real reconnect for what might just be a blip')
  })

  it('returns null with no throw when no credential is stored under that name/purpose', async () => {
    const storePath = tempStorePath()
    process.env.CONDUITS_CREDENTIAL_STORE_PATH = storePath
    const token = await gatewayServiceRuntime.getCredential(conduitConfig({ credentialRef: 'google:nobody-authorized-this' }))
    assert.equal(token, null)
  })
})

describe('gatewayServiceRuntime.invalidateCredential — googleSheets/gmail', () => {
  afterEach(() => {
    delete process.env.CONDUITS_CREDENTIAL_STORE_PATH
  })

  it('removes the local grant a live source rejection was traced back to', async () => {
    const storePath = tempStorePath()
    process.env.CONDUITS_CREDENTIAL_STORE_PATH = storePath
    saveGoogleGrant(storePath, expiredGrant({ purpose: 'sheets' }))

    await gatewayServiceRuntime.invalidateCredential(conduitConfig({ suriType: 'googleSheets' }))

    assert.equal(loadGoogleGrant(storePath, 'personal', 'sheets'), null)
  })
})
