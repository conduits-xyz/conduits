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
    // A user's own "id" or "ID" column is never taken for the id column.
    assert.equal(idColumnIndex(['id', 'name', 'email']), -1)
    assert.equal(idColumnIndex(['ID', 'name', 'email']), -1)
  })

  it('translates the conduit-id column to `id` and never leaves the raw column name as a stray key', () => {
    // rowToFields renames the column, so no "conduit-id" key appears in
    // `fields`. Only a real sheet has that column; the fake client
    // doesn't.
    const fields = rowToFields(['conduit-id', 'name', 'email'], ['452qweqkf222', 'Ada', 'ada@example.com'])
    assert.deepEqual(fields, { id: '452qweqkf222', name: 'Ada', email: 'ada@example.com' })
    assert.equal((fields as Record<string, unknown>)['conduit-id'], undefined)
  })

  it('excludes rows with no usable id — a blank id cell, or the id column missing entirely', () => {
    // A blank id cell, as when a user clears one by hand.
    assert.deepEqual(
      rowsFromGrid([
        ['conduit-id', 'name'],
        ['', 'no id, excluded'],
        ['real-id-1', 'Ada'],
      ]),
      [{ id: 'real-id-1', name: 'Ada' }],
    )

    // No id column (deleted by hand, or a sheet never written through
    // the API): every row is excluded.
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
