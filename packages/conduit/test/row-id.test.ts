import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createRowIdMaker, createdTimeFromRowId } from '../row-id.ts'

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const AT = Date.UTC(2026, 9, 5, 12)

// A maker whose clock the test sets.
function maker() {
  let now = AT
  return { make: createRowIdMaker(() => now), set: (ms: number) => (now = ms) }
}

describe('row ids', () => {
  it('uses only the specified alphabet end to end, including the counter', () => {
    const { make } = maker()
    for (let i = 0; i < 50; i++) {
      const id = make()
      for (const char of id) assert.ok(ALPHABET.includes(char), `unexpected character "${char}" in id "${id}"`)
    }
  })

  it('decodes back to the timestamp it was made at', () => {
    assert.equal(createdTimeFromRowId(maker().make()), new Date(AT).toISOString())
  })

  it('two ids made in the same millisecond are still different', () => {
    const { make } = maker()
    assert.notEqual(make(), make())
  })

  it('sorts lexically in creation order, including ties within the same millisecond', () => {
    const { make, set } = maker()
    const sameMillisecond = [make(), make(), make()]
    set(AT + 1)
    const inCreationOrder = [...sameMillisecond, make()]
    assert.deepEqual([...inCreationOrder].sort(), inCreationOrder)
  })

  it('gracefully returns null for an id that predates this scheme', () => {
    assert.equal(createdTimeFromRowId('o_YwQaEbpcGQ'), null)
  })
})
