import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { parseFlags, isGooglePurpose } from '../cli-flags.ts'

const AUTH_FLAGS = ['purpose', 'name']

describe('parseFlags', () => {
  it('parses --key value pairs', () => {
    assert.deepEqual(parseFlags(['--purpose', 'sheets', '--name', 'personal'], AUTH_FLAGS), { purpose: 'sheets', name: 'personal' })
  })

  it('parses --key=value pairs', () => {
    assert.deepEqual(parseFlags(['--purpose=sheets', '--name=personal'], AUTH_FLAGS), { purpose: 'sheets', name: 'personal' })
  })

  it('mixes --key value and --key=value in the same call', () => {
    assert.deepEqual(parseFlags(['--purpose=sheets', '--name', 'personal'], AUTH_FLAGS), { purpose: 'sheets', name: 'personal' })
  })

  it('throws a specific, actionable message for an unrecognized flag, not a silent no-op', () => {
    assert.throws(() => parseFlags(['--puspose', 'sheets'], AUTH_FLAGS), /unrecognized flag '--puspose' — expected one of: --purpose, --name/)
  })

  it('rejects an unrecognized flag given as --key=value too', () => {
    assert.throws(() => parseFlags(['--puspose=sheets'], AUTH_FLAGS), /unrecognized flag '--puspose'/)
  })

  it('throws when a flag has no following value', () => {
    assert.throws(() => parseFlags(['--purpose'], AUTH_FLAGS), /--purpose requires a value/)
  })

  it('throws when a flag is immediately followed by another flag', () => {
    assert.throws(() => parseFlags(['--purpose', '--name', 'x'], AUTH_FLAGS), /--purpose requires a value/)
  })

  it('ignores bare (non---prefixed) tokens', () => {
    assert.deepEqual(parseFlags(['google', '--purpose', 'gmail'], AUTH_FLAGS), { purpose: 'gmail' })
  })
})

describe('isGooglePurpose', () => {
  it('accepts sheets and gmail only', () => {
    assert.ok(isGooglePurpose('sheets'))
    assert.ok(isGooglePurpose('gmail'))
    assert.ok(!isGooglePurpose('googleSheets'))
    assert.ok(!isGooglePurpose(undefined))
  })
})
