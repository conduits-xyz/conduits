import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { parseFlags, isGooglePurpose } from '../cli-flags.ts'

describe('parseFlags', () => {
  it('parses --key value pairs', () => {
    assert.deepEqual(parseFlags(['--purpose', 'sheets', '--name', 'personal']), { purpose: 'sheets', name: 'personal' })
  })

  it('throws when a flag has no following value', () => {
    assert.throws(() => parseFlags(['--purpose']), /--purpose requires a value/)
  })

  it('throws when a flag is immediately followed by another flag', () => {
    assert.throws(() => parseFlags(['--purpose', '--name', 'x']), /--purpose requires a value/)
  })

  it('ignores bare (non---prefixed) tokens', () => {
    assert.deepEqual(parseFlags(['google', '--purpose', 'gmail']), { purpose: 'gmail' })
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
