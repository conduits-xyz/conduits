import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createRowIdMaker, createdTimeFromRowId } from '../row-id.ts'

const AT = Date.UTC(2026, 9, 5, 12)

// A maker whose clock the test sets.
function maker() {
  let now = AT
  return { make: createRowIdMaker(() => now), set: (ms: number) => (now = ms) }
}

describe('row ids', () => {
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

  // Worked out apart from row-id.ts: the milliseconds since 1970-01-01
  // in base 31, most significant digit first. 31^9 - 1 =
  // 26,439,622,160,670 ms is 2807-11-03T03:29:20.670Z.
  it('starts with the base-31 timestamp, in ascending order of the alphabet, up to the last one', () => {
    const { make, set } = maker()
    for (const [ms, timestamp] of [
      [Date.UTC(1970, 0, 1), '222222222'],
      [Date.UTC(2000, 0, 1), '35eq73k6v'],
      [Date.UTC(2026, 10, 6), '458brbfam'],
      [Date.UTC(2807, 10, 3, 3, 29, 20, 670), 'zzzzzzzzz'],
    ] as const) {
      set(ms)
      assert.equal(make(), `${timestamp}222`)
    }
    set(31 ** 9)
    assert.throws(() => make())
    // The refused timestamp changed nothing: the counter goes on.
    set(31 ** 9 - 1)
    assert.equal(make(), 'zzzzzzzzz223')
  })

  it('refuses an id after the last one of a millisecond, rather than repeating one', () => {
    const { make, set } = maker()
    let last = ''
    for (let i = 0; i < 31 ** 3; i++) last = make()
    assert.equal(last.slice(-3), 'zzz')
    assert.throws(() => make(), /more than 29791 row ids in one millisecond/)
    set(AT + 1)
    assert.equal(make().slice(-3), '222')
  })

  it('gracefully returns null for an id that predates this scheme', () => {
    assert.equal(createdTimeFromRowId('o_YwQaEbpcGQ'), null)
  })
})
