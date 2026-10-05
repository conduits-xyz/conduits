import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import type { ConduitConfig } from '@conduits/gateway'
import { createGatewayServiceRuntime } from '../runtime.ts'
import { loadGoogleGrant, saveGoogleGrant } from '@conduits/credential-store'
import type { StoredGoogleGrant } from '@conduits/credential-store'

// The runtime's getCredential() and invalidateCredential() against an
// injected token endpoint and clock, and a local file.
const NOW = Date.parse('2026-10-05T12:00:00.000Z')

// A runtime whose token endpoint answers with `handler`; without one,
// any refresh fails the test.
function runtime(storePath: string, handler: () => Response = () => assert.fail('unexpected token refresh')) {
  const fetchImpl = (async () => handler()) as typeof fetch
  return createGatewayServiceRuntime(storePath, { endpoint: { tokenUrl: 'https://oauth.example/token', fetch: fetchImpl }, now: () => NOW })
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
    apiKeys: [],
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
      expiresAt: new Date(NOW - 1000),
    },
    ...overrides,
  }
}

describe('the service runtime: getCredential — googleSheets/gmail', () => {

  it('returns the cached access token directly when it is not expiring soon (no refresh call at all)', async () => {
    const storePath = tempStorePath()
    saveGoogleGrant(storePath, expiredGrant({ tokens: { accessToken: 'fresh-token', expiresAt: new Date(NOW + 3_600_000) } }))

    const token = await runtime(storePath).getCredential(conduitConfig())
    assert.equal(token, 'fresh-token')
  })

  it('refreshes and persists a new access token when the stored one is expiring, for suriType googleSheets (purpose sheets)', async () => {
    const storePath = tempStorePath()
    saveGoogleGrant(storePath, expiredGrant({ purpose: 'sheets' }))
    const token = await runtime(storePath, () => jsonResponse({ access_token: 'fresh-access-token', expires_in: 3600, token_type: 'Bearer' })).getCredential(conduitConfig({ suriType: 'googleSheets' }))
    assert.equal(token, 'fresh-access-token')

    const reloaded = loadGoogleGrant(storePath, 'personal', 'sheets')
    assert.equal(reloaded?.tokens.accessToken, 'fresh-access-token')
    assert.equal(reloaded?.tokens.expiresAt?.toISOString(), '2026-10-05T13:00:00.000Z')
  })

  it('derives purpose "gmail" for suriType gmail — a grant saved only under "sheets" is not found', async () => {
    const storePath = tempStorePath()
    saveGoogleGrant(storePath, expiredGrant({ purpose: 'sheets' }))

    const token = await runtime(storePath).getCredential(conduitConfig({ suriType: 'gmail', suriObjectKey: '' }))
    assert.equal(token, null, 'a sheets-purpose grant must not satisfy a gmail-purpose lookup')
  })

  it('deletes the local grant when Google reports the grant as expired or revoked', async () => {
    const storePath = tempStorePath()
    saveGoogleGrant(storePath, expiredGrant())
    const token = await runtime(storePath, () => jsonResponse({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400)).getCredential(conduitConfig())
    assert.equal(token, null)
    assert.equal(loadGoogleGrant(storePath, 'personal', 'sheets'), null, 'a confirmed-dead grant must be removed, not left to fail forever')
  })

  it('does not delete the grant on an ambiguous or transient failure', async () => {
    const storePath = tempStorePath()
    saveGoogleGrant(storePath, expiredGrant())
    const token = await runtime(storePath, () => new Response('', { status: 503 })).getCredential(conduitConfig())
    assert.equal(token, null)
    assert.ok(loadGoogleGrant(storePath, 'personal', 'sheets'), 'a transient failure must not force a real reconnect for what might just be a blip')
  })

  it('returns null with no throw when no credential is stored under that name/purpose', async () => {
    const storePath = tempStorePath()
    const token = await runtime(storePath).getCredential(conduitConfig({ credentialRef: 'google:nobody-authorized-this' }))
    assert.equal(token, null)
  })
})

describe('the service runtime: invalidateCredential — googleSheets/gmail', () => {

  it('removes the local grant a live source rejection was traced back to', async () => {
    const storePath = tempStorePath()
    saveGoogleGrant(storePath, expiredGrant({ purpose: 'sheets' }))

    await runtime(storePath).invalidateCredential(conduitConfig({ suriType: 'googleSheets' }))

    assert.equal(loadGoogleGrant(storePath, 'personal', 'sheets'), null)
  })
})
