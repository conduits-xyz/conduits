import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { credentialStorePath, loadConduitConfigs } from '../config.ts'

function thrownMessage(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
  throw new Error('expected fn to throw')
}

describe('loadConduitConfigs', () => {
  it('gives an actionable error naming the missing file and the fix, not a raw ENOENT', () => {
    const missingPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'conduits-config-test-')), 'conduits.yaml')
    const message = thrownMessage(() => loadConduitConfigs(missingPath))
    assert.ok(message.includes(missingPath), `error should name the exact missing path, got: ${message}`)
    assert.ok(message.includes('copy conduits.example.yaml'), `error should say how to fix it, got: ${message}`)
    assert.ok(!message.includes('ENOENT'), 'the raw errno code should not leak into the message')
  })

  it('still surfaces a non-ENOENT filesystem error unchanged (e.g. a directory given instead of a file)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'conduits-config-test-'))
    assert.throws(() => loadConduitConfigs(dir), /EISDIR/)
  })
})

describe('credentialStorePath', () => {
  it('honors CONDUITS_CREDENTIAL_STORE_PATH, defaulting to ~/.conduits/credentials.json', () => {
    const original = process.env.CONDUITS_CREDENTIAL_STORE_PATH
    try {
      delete process.env.CONDUITS_CREDENTIAL_STORE_PATH
      assert.equal(credentialStorePath(), path.join(os.homedir(), '.conduits', 'credentials.json'))
      process.env.CONDUITS_CREDENTIAL_STORE_PATH = '/tmp/custom-credentials.json'
      assert.equal(credentialStorePath(), '/tmp/custom-credentials.json')
    } finally {
      if (original === undefined) delete process.env.CONDUITS_CREDENTIAL_STORE_PATH
      else process.env.CONDUITS_CREDENTIAL_STORE_PATH = original
    }
  })
})
