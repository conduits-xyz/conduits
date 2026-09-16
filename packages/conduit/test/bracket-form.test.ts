import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { expandBracketForm } from '../bracket-form.ts'

describe('expandBracketForm', () => {
  it('treats a bare (bracket-free) form as the record fields directly', () => {
    const result = expandBracketForm([
      ['name', 'Ada'],
      ['email', 'ada@example.com'],
    ])
    assert.deepEqual(result, { fields: { name: 'Ada', email: 'ada@example.com' } })
  })

  it('expands single-level bracket notation', () => {
    const result = expandBracketForm([
      ['fields[name]', 'Ada'],
      ['fields[email]', 'ada@example.com'],
    ])
    assert.deepEqual(result, { fields: { name: 'Ada', email: 'ada@example.com' } })
  })

  it('expands nested bracket notation with array indices', () => {
    const result = expandBracketForm([
      ['records[0][fields][name]', 'Ada'],
      ['records[1][fields][name]', 'Grace'],
    ])
    assert.deepEqual(result, { records: [{ fields: { name: 'Ada' } }, { fields: { name: 'Grace' } }] })
  })
})
