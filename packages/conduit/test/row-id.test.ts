import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { randomRowId, createdTimeFromRowId } from '../row-id.ts'

const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'

describe('row ids', () => {
  it('uses only the specified alphabet end to end, including the counter', () => {
    for (let i = 0; i < 50; i++) {
      const id = randomRowId()
      for (const char of id) {
        assert.ok(ALPHABET.includes(char), `unexpected character "${char}" in id "${id}"`)
      }
    }
  })

  it('decodes back to the timestamp it was generated from', () => {
    const now = Date.now()
    const id = randomRowId(now)
    assert.equal(createdTimeFromRowId(id), new Date(now).toISOString())
  })

  it('two ids generated in the same millisecond are still different', () => {
    const now = Date.now()
    assert.notEqual(randomRowId(now), randomRowId(now))
  })

  it('sorts lexically in creation order, including ties within the same millisecond', () => {
    const now = Date.now()
    const sameMillisecond = [randomRowId(now), randomRowId(now), randomRowId(now)]
    const nextMillisecond = randomRowId(now + 1)
    const inCreationOrder = [...sameMillisecond, nextMillisecond]

    assert.deepEqual([...inCreationOrder].sort(), inCreationOrder)
  })

  it('gracefully returns null for an id that predates this scheme', () => {
    assert.equal(createdTimeFromRowId('o_YwQaEbpcGQ'), null)
  })
})
