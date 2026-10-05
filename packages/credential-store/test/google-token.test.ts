import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { getFreshGoogleAccessToken } from '../google-token.ts'
import { saveGoogleGrant, loadGoogleGrant } from '../google-credential-store.ts'
import type { StoredGoogleGrant } from '../google-credential-store.ts'

// getFreshGoogleAccessToken() called directly: without a ConduitConfig,
// an expiring grant with no refresh token, and the onRevoked hook. The
// other statuses are tested through the runtime in
// services/gateway/test/runtime-google.test.ts.

function tempStorePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduits-google-token-test-'))
  return path.join(dir, 'credentials.json')
}

const NOW = Date.parse('2026-10-05T12:00:00.000Z')

// A token endpoint that answers every refresh with `body` and `status`.
function tokenOptions(body: object = {}, status = 200) {
  const endpoint = {
    tokenUrl: 'https://oauth.example/token',
    fetch: (async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as typeof fetch,
  }
  return { endpoint, now: () => NOW }
}

function grant(overrides: Partial<StoredGoogleGrant> = {}): StoredGoogleGrant {
  return {
    name: 'personal',
    purpose: 'sheets',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    tokens: { accessToken: 'fresh-token', refreshToken: 'refresh-token', expiresAt: new Date(NOW + 3_600_000) },
    ...overrides,
  }
}

describe('getFreshGoogleAccessToken', () => {

  it('resolves a fresh, non-expiring grant directly by name/purpose — no ConduitConfig needed', async () => {
    const storePath = tempStorePath()
    saveGoogleGrant(storePath, grant())

    const result = await getFreshGoogleAccessToken(storePath, 'personal', 'sheets', tokenOptions())
    assert.deepEqual(result, { status: 'ok', accessToken: 'fresh-token' })
  })

  it('reports "missing" for a name/purpose that was never authorized', async () => {
    const storePath = tempStorePath()

    const result = await getFreshGoogleAccessToken(storePath, 'nobody-authorized-this', 'sheets', tokenOptions())
    assert.deepEqual(result, { status: 'missing' })
  })

  it('reports "no-refresh-token" for an expiring grant with nothing to renew it with, rather than throwing or silently returning the stale token', async () => {
    const storePath = tempStorePath()
    saveGoogleGrant(
      storePath,
      grant({
        tokens: { accessToken: 'stale-token', expiresAt: new Date(NOW - 1000) },
      }),
    )

    const result = await getFreshGoogleAccessToken(storePath, 'personal', 'sheets', tokenOptions())
    assert.deepEqual(result, { status: 'no-refresh-token' })
  })

  it('calls options.onRevoked instead of deleting the grant, when provided', async () => {
    const storePath = tempStorePath()
    saveGoogleGrant(storePath, grant({ generation: 5, tokens: { accessToken: 'stale', refreshToken: 'dead-refresh-token', expiresAt: new Date(NOW - 1000) } }))

    let onRevokedArgs: unknown
    const result = await getFreshGoogleAccessToken(storePath, 'personal', 'sheets', {
      ...tokenOptions({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400),
      onRevoked: (storePathArg, name, purpose) => {
        onRevokedArgs = { storePathArg, name, purpose }
      },
    })
    assert.deepEqual(result, { status: 'revoked' })

    assert.deepEqual(onRevokedArgs, { storePathArg: storePath, name: 'personal', purpose: 'sheets' })
    assert.ok(loadGoogleGrant(storePath, 'personal', 'sheets'), 'onRevoked being provided must suppress the default delete')
  })

  it('refreshes an expiring grant, counting the new expiry from the injected instant, and keeps the refresh token', async () => {
    const storePath = tempStorePath()
    saveGoogleGrant(storePath, grant({ tokens: { accessToken: 'stale', refreshToken: 'refresh-token', expiresAt: new Date(NOW - 1000) } }))

    const result = await getFreshGoogleAccessToken(storePath, 'personal', 'sheets', tokenOptions({ access_token: 'renewed', expires_in: 3600 }))
    assert.deepEqual(result, { status: 'ok', accessToken: 'renewed' })
    const { tokens } = loadGoogleGrant(storePath, 'personal', 'sheets')!
    assert.deepEqual([tokens.refreshToken, tokens.expiresAt?.toISOString()], ['refresh-token', '2026-10-05T13:00:00.000Z'])
  })
})
