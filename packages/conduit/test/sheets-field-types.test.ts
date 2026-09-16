import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { inferColumnType } from '../sheets.ts'

describe('sheets column type inference', () => {
  it('infers number only when every non-blank value parses as one', () => {
    assert.equal(inferColumnType(['1', '2', '3']), 'number')
    assert.equal(inferColumnType(['1', '2.5', '-3']), 'number')
    assert.equal(inferColumnType(['1', '', '3']), 'number', 'a blank cell does not break a numeric column')
  })

  it('infers boolean only for exact TRUE/FALSE, matching Sheets formatted output', () => {
    assert.equal(inferColumnType(['TRUE', 'FALSE', 'TRUE']), 'boolean')
    assert.equal(inferColumnType(['TRUE', 'true']), 'string', 'case must match exactly — this is not a loose parse')
  })

  it('infers date for ISO-8601-shaped values, checked before number', () => {
    assert.equal(inferColumnType(['2024-01-01', '2024-12-31']), 'date')
    assert.equal(inferColumnType(['2024-01-01T10:30:00Z']), 'date')
  })

  it('falls back to string the moment any value disagrees', () => {
    assert.equal(inferColumnType(['1', '2', 'not a number']), 'string')
    assert.equal(inferColumnType(['TRUE', 'FALSE', 'maybe']), 'string')
  })

  it('defaults to string for an all-blank or empty column', () => {
    assert.equal(inferColumnType([]), 'string')
    assert.equal(inferColumnType(['', '', '']), 'string')
  })
})
