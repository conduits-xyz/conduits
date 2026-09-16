import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as assert from 'remix/assert'
import { describe, it, afterEach } from 'remix/test'

import { getFreshGoogleAccessToken } from '../google-token.ts'
import { saveGoogleGrant, loadGoogleGrant } from '../google-credential-store.ts'
import type { StoredGoogleGrant } from '../google-credential-store.ts'

// The four other GoogleTokenResult statuses (ok-after-refresh, missing,
// revoked, refresh-failed) are already exercised in depth via
// services/gateway's own runtime-google.test.ts (gatewayServiceRuntime.
// getCredential), which goes through this exact function — no need to
// duplicate those here. This file covers what only calling
// getFreshGoogleAccessToken() directly can: its own public contract
// (usable with a bare name/purpose, no ConduitConfig required), the one
// status runtime-google.test.ts never exercises (a grant that's
// expiring with no refresh token at all to renew it with), and the
// onRevoked hook a generation-tracking caller relies on.

function tempStorePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduits-google-token-test-'))
  return path.join(dir, 'credentials.json')
}

function grant(overrides: Partial<StoredGoogleGrant> = {}): StoredGoogleGrant {
  return {
    name: 'personal',
    purpose: 'sheets',
    clientId: 'client-id',
    clientSecret: 'client-secret',
    tokens: { accessToken: 'fresh-token', refreshToken: 'refresh-token', expiresAt: new Date(Date.now() + 3_600_000) },
    ...overrides,
  }
}

describe('getFreshGoogleAccessToken', () => {
  afterEach(() => {
    delete process.env.CONDUITS_CREDENTIAL_STORE_PATH
  })

  it('resolves a fresh, non-expiring grant directly by name/purpose — no ConduitConfig needed', async () => {
    const storePath = tempStorePath()
    process.env.CONDUITS_CREDENTIAL_STORE_PATH = storePath
    saveGoogleGrant(storePath, grant())

    const result = await getFreshGoogleAccessToken('personal', 'sheets')
    assert.deepEqual(result, { status: 'ok', accessToken: 'fresh-token' })
  })

  it('reports "missing" for a name/purpose that was never authorized', async () => {
    const storePath = tempStorePath()
    process.env.CONDUITS_CREDENTIAL_STORE_PATH = storePath

    const result = await getFreshGoogleAccessToken('nobody-authorized-this', 'sheets')
    assert.deepEqual(result, { status: 'missing' })
  })

  it('reports "no-refresh-token" for an expiring grant with nothing to renew it with, rather than throwing or silently returning the stale token', async () => {
    const storePath = tempStorePath()
    process.env.CONDUITS_CREDENTIAL_STORE_PATH = storePath
    saveGoogleGrant(
      storePath,
      grant({
        tokens: { accessToken: 'stale-token', expiresAt: new Date(Date.now() - 1000) },
      }),
    )

    const result = await getFreshGoogleAccessToken('personal', 'sheets')
    assert.deepEqual(result, { status: 'no-refresh-token' })
  })

  it('calls options.onRevoked instead of deleting the grant, when provided', async () => {
    const storePath = tempStorePath()
    process.env.CONDUITS_CREDENTIAL_STORE_PATH = storePath
    saveGoogleGrant(storePath, grant({ generation: 5, tokens: { accessToken: 'stale', refreshToken: 'dead-refresh-token', expiresAt: new Date(Date.now() - 1000) } }))

    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch
    let onRevokedArgs: unknown
    try {
      const result = await getFreshGoogleAccessToken('personal', 'sheets', {
        onRevoked: (storePathArg, name, purpose) => {
          onRevokedArgs = { storePathArg, name, purpose }
        },
      })
      assert.deepEqual(result, { status: 'revoked' })
    } finally {
      globalThis.fetch = original
    }

    assert.deepEqual(onRevokedArgs, { storePathArg: storePath, name: 'personal', purpose: 'sheets' })
    assert.ok(loadGoogleGrant(storePath, 'personal', 'sheets'), 'onRevoked being provided must suppress the default delete')
  })
})
