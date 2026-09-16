import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import {
  loadFastmailCredential,
  saveFastmailCredential,
  markFastmailCredentialInvalid,
  deleteFastmailCredential,
} from '../fastmail-credential-store.ts'

function tempStorePath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduits-fastmail-store-test-'))
  return path.join(dir, 'fastmail-credentials.json')
}

describe('fastmail-credential-store', () => {
  it('returns null for a credentialRef that was never saved', () => {
    const storePath = tempStorePath()
    assert.equal(loadFastmailCredential(storePath, 'fastmail:12'), null)
  })

  it('saves and loads a credential round-trip, independent of other refs', () => {
    const storePath = tempStorePath()
    saveFastmailCredential(storePath, { credentialRef: 'fastmail:12', apiToken: 'token-12', generation: 1, status: 'active' })
    saveFastmailCredential(storePath, { credentialRef: 'fastmail:19', apiToken: 'token-19', generation: 1, status: 'active' })

    assert.equal(loadFastmailCredential(storePath, 'fastmail:12')?.apiToken, 'token-12')
    assert.equal(loadFastmailCredential(storePath, 'fastmail:19')?.apiToken, 'token-19')
  })

  it('markFastmailCredentialInvalid tombstones in place, preserving generation and apiToken', () => {
    const storePath = tempStorePath()
    saveFastmailCredential(storePath, { credentialRef: 'fastmail:12', apiToken: 'token-12', generation: 1, status: 'active' })

    markFastmailCredentialInvalid(storePath, 'fastmail:12')

    const loaded = loadFastmailCredential(storePath, 'fastmail:12')
    assert.equal(loaded?.status, 'invalid')
    assert.equal(loaded?.generation, 1)
    assert.equal(loaded?.apiToken, 'token-12')
  })

  it('deleteFastmailCredential removes only the given ref (orphan cleanup)', () => {
    const storePath = tempStorePath()
    saveFastmailCredential(storePath, { credentialRef: 'fastmail:12', apiToken: 'token-12', generation: 1, status: 'active' })
    saveFastmailCredential(storePath, { credentialRef: 'fastmail:19', apiToken: 'token-19', generation: 1, status: 'active' })

    deleteFastmailCredential(storePath, 'fastmail:12')

    assert.equal(loadFastmailCredential(storePath, 'fastmail:12'), null)
    assert.ok(loadFastmailCredential(storePath, 'fastmail:19'))
  })

  it('deleting/tombstoning a ref that was never saved is a harmless no-op', () => {
    const storePath = tempStorePath()
    deleteFastmailCredential(storePath, 'nothing')
    markFastmailCredentialInvalid(storePath, 'nothing')
    assert.equal(loadFastmailCredential(storePath, 'nothing'), null)
  })
})
