import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { columnToLetter, idColumnIndex, rowToFields, rowsFromGrid } from '../sheets.ts'

describe('sheets id column', () => {
  it('finds an existing conduit-id column anywhere in the header', () => {
    assert.equal(idColumnIndex(['conduit-id', 'name', 'email']), 0)
    assert.equal(idColumnIndex(['name', 'email', 'conduit-id']), 2)
    assert.equal(idColumnIndex(['Company', 'Category']), -1)
    assert.equal(idColumnIndex([]), -1)
  })

  it('does not mistake a user\'s own "id" column for ours', () => {
    // The whole point of the conduit-id name: a generic "id" or "ID"
    // column the user already has for their own purposes must never be
    // treated as ours, or we'd either add a confusing duplicate or, worse,
    // overwrite data that isn't ours.
    assert.equal(idColumnIndex(['id', 'name', 'email']), -1)
    assert.equal(idColumnIndex(['ID', 'name', 'email']), -1)
  })

  it('translates the conduit-id column to `id` and never leaves the raw column name as a stray key', () => {
    // Regression test: skipping this translation and building the row
    // object directly from a raw grid row leaks a literal "conduit-id"
    // key into `fields` alongside the correctly-translated `id` — only
    // ever visible against a real spreadsheet, since the test suite's
    // fake client has no separate bookkeeping-column concept to get wrong.
    const fields = rowToFields(['conduit-id', 'name', 'email'], ['452qweqkf222', 'Ada', 'ada@example.com'])
    assert.deepEqual(fields, { id: '452qweqkf222', name: 'Ada', email: 'ada@example.com' })
    assert.equal((fields as Record<string, unknown>)['conduit-id'], undefined)
  })

  it('excludes rows with no usable id — a blank id cell, or the id column missing entirely', () => {
    // A blank id cell (Sheets never actually leaves one blank once a row
    // is written via the API, but a user could clear a cell by hand).
    assert.deepEqual(
      rowsFromGrid([
        ['conduit-id', 'name'],
        ['', 'no id, excluded'],
        ['real-id-1', 'Ada'],
      ]),
      [{ id: 'real-id-1', name: 'Ada' }],
    )

    // The id column missing from the header entirely (someone deleted
    // the conduit-id column directly in the sheet, or a pre-existing
    // sheet with real data was never bootstrapped through the API at
    // all) — every row here has to be excluded, not just one with an
    // actually-blank cell.
    assert.deepEqual(
      rowsFromGrid([
        ['name', 'email'],
        ['Ada', 'ada@example.com'],
        ['Grace', 'grace@example.com'],
      ]),
      [],
    )
  })

  it('converts a 1-indexed column number to its A1 letter', () => {
    assert.equal(columnToLetter(1), 'A')
    assert.equal(columnToLetter(4), 'D')
    assert.equal(columnToLetter(26), 'Z')
    assert.equal(columnToLetter(27), 'AA')
    assert.equal(columnToLetter(28), 'AB')
    assert.equal(columnToLetter(52), 'AZ')
    assert.equal(columnToLetter(53), 'BA')
  })
})
