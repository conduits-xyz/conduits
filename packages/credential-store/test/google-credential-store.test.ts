import * as fs from 'node:fs'
import * as path from 'node:path'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { loadGoogleGrant, saveGoogleGrant, deleteGoogleGrant, markGoogleGrantInvalid } from '../google-credential-store.ts'
import type { StoredGoogleGrant } from '../google-credential-store.ts'
import { googleGrant, tempStorePath } from '../testing.ts'

const grant = (overrides: Partial<StoredGoogleGrant> = {}) =>
  googleGrant({ accessToken: 'access-token', refreshToken: 'refresh-token', expiresAt: new Date(Date.now() + 3_600_000) }, overrides)

describe('google-credential-store', () => {
  it('returns null for a name/purpose that was never saved', () => {
    const storePath = tempStorePath('nested/credentials.json')
    assert.equal(loadGoogleGrant(storePath, 'personal', 'sheets'), null)
  })

  it('saves and loads a grant round-trip', () => {
    const storePath = tempStorePath('nested/credentials.json')
    saveGoogleGrant(storePath, grant())
    const loaded = loadGoogleGrant(storePath, 'personal', 'sheets')
    assert.equal(loaded?.clientId, 'client-id')
    assert.equal(loaded?.tokens.accessToken, 'access-token')
  })

  it('keeps sheets and gmail as separate grants under the same name', () => {
    const storePath = tempStorePath('nested/credentials.json')
    saveGoogleGrant(storePath, grant({ purpose: 'sheets', tokens: { accessToken: 'sheets-token' } }))
    saveGoogleGrant(storePath, grant({ purpose: 'gmail', tokens: { accessToken: 'gmail-token' } }))

    assert.equal(loadGoogleGrant(storePath, 'personal', 'sheets')?.tokens.accessToken, 'sheets-token')
    assert.equal(loadGoogleGrant(storePath, 'personal', 'gmail')?.tokens.accessToken, 'gmail-token')
  })

  it('keeps different names fully independent', () => {
    const storePath = tempStorePath('nested/credentials.json')
    saveGoogleGrant(storePath, grant({ name: 'personal', tokens: { accessToken: 'personal-token' } }))
    saveGoogleGrant(storePath, grant({ name: 'work', tokens: { accessToken: 'work-token' } }))

    assert.equal(loadGoogleGrant(storePath, 'personal', 'sheets')?.tokens.accessToken, 'personal-token')
    assert.equal(loadGoogleGrant(storePath, 'work', 'sheets')?.tokens.accessToken, 'work-token')
  })

  it('deletes only the named (name, purpose) pair, leaving the sibling purpose intact', () => {
    const storePath = tempStorePath('nested/credentials.json')
    saveGoogleGrant(storePath, grant({ purpose: 'sheets' }))
    saveGoogleGrant(storePath, grant({ purpose: 'gmail' }))

    deleteGoogleGrant(storePath, 'personal', 'sheets')

    assert.equal(loadGoogleGrant(storePath, 'personal', 'sheets'), null)
    assert.ok(loadGoogleGrant(storePath, 'personal', 'gmail'))
  })

  it('deleting a grant that was never saved is a harmless no-op', () => {
    const storePath = tempStorePath('nested/credentials.json')
    deleteGoogleGrant(storePath, 'nothing', 'sheets')
    assert.equal(loadGoogleGrant(storePath, 'nothing', 'sheets'), null)
  })

  it('creates the parent directory and writes the file mode 0600 (POSIX only)', () => {
    if (process.platform === 'win32') return
    const storePath = tempStorePath('nested/credentials.json')
    saveGoogleGrant(storePath, grant())

    const fileMode = fs.statSync(storePath).mode & 0o777
    assert.equal(fileMode, 0o600, `expected credentials.json to be 0600, got ${fileMode.toString(8)}`)

    const dirMode = fs.statSync(path.dirname(storePath)).mode & 0o777
    assert.equal(dirMode, 0o700, `expected the parent directory to be 0700, got ${dirMode.toString(8)}`)
  })

  it('leaves no leftover temp files after an atomic write', () => {
    const storePath = tempStorePath('nested/credentials.json')
    saveGoogleGrant(storePath, grant())
    const dirEntries = fs.readdirSync(path.dirname(storePath))
    assert.deepEqual(dirEntries, ['credentials.json'], 'the rename must leave exactly the final file, no .tmp leftovers')
  })

  it('round-trips generation/status, defaulting to undefined for a grant that never set them', () => {
    const storePath = tempStorePath('nested/credentials.json')
    saveGoogleGrant(storePath, grant())
    const loaded = loadGoogleGrant(storePath, 'personal', 'sheets')
    assert.equal(loaded?.generation, undefined)
    assert.equal(loaded?.status, undefined)

    saveGoogleGrant(storePath, grant({ generation: 5, status: 'active' }))
    const withGeneration = loadGoogleGrant(storePath, 'personal', 'sheets')
    assert.equal(withGeneration?.generation, 5)
    assert.equal(withGeneration?.status, 'active')
  })

  it('markGoogleGrantInvalid tombstones a grant in place, preserving its generation and material', () => {
    const storePath = tempStorePath('nested/credentials.json')
    saveGoogleGrant(storePath, grant({ generation: 5, status: 'active' }))

    markGoogleGrantInvalid(storePath, 'personal', 'sheets')

    const loaded = loadGoogleGrant(storePath, 'personal', 'sheets')
    assert.equal(loaded?.status, 'invalid')
    assert.equal(loaded?.generation, 5, 'tombstoning must not touch generation')
    assert.equal(loaded?.clientId, 'client-id', 'tombstoning must not discard the rest of the grant')
  })

  it('markGoogleGrantInvalid on a name/purpose never saved is a harmless no-op', () => {
    const storePath = tempStorePath('nested/credentials.json')
    markGoogleGrantInvalid(storePath, 'nobody', 'sheets')
    assert.equal(loadGoogleGrant(storePath, 'nobody', 'sheets'), null)
  })
})
