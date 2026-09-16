// Fixed-width base-31 encoding. Doing this for row ids gives
// `createdTime` "for free" — decoded from the id itself, never a
// separately persisted value.
//
// Alphabet excludes 0, 1, i, l, o — visually confusable with each other
// or with digits — so a printed/read-aloud id can't be mistranscribed.
// Fixed width + ascending alphabet order means lexical string sort and
// numeric order are always identical — the whole point of encoding the
// timestamp this way is that ids sort naturally, so nothing in this file
// may compromise that, including how same-millisecond ties are broken.
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const BASE = ALPHABET.length // 31
const TIMESTAMP_LENGTH = 9 // 31^9 ~= 1.75e13 ms ~= year 2525 — plenty of headroom

// A per-millisecond counter, not randomness, breaks ties within the same
// millisecond — two ids created in the same ms still sort in creation
// order, which a random suffix never would have (a random tiebreaker sorts
// same-ms ids arbitrarily, not by when they were actually created).
// 3 digits (31^3 = 29,791 ids/ms before wrapping) is generous headroom:
// bulk requests are capped at 10 records (record-shape.ts), and a bulk
// create issues every id in a single synchronous loop before the one
// batched Sheets API call that writes them all (sheets.ts's appendRows) —
// so same-millisecond ids aren't just a theoretical/test-only case, they're
// the *normal* case for any bulk create in production.
const COUNTER_LENGTH = 3

function encodeBase31(value: number, length: number): string {
  let remaining = value
  const chars = new Array(length).fill(ALPHABET[0])
  for (let index = length - 1; index >= 0; index--) {
    chars[index] = ALPHABET[remaining % BASE]
    remaining = Math.floor(remaining / BASE)
  }
  if (remaining !== 0) throw new Error(`value ${value} exceeds ${length}-digit base-31 codec range`)
  return chars.join('')
}

function decodeBase31(token: string): number {
  let value = 0
  for (const char of token) {
    const digit = ALPHABET.indexOf(char)
    if (digit === -1) throw new Error(`invalid character in row id: ${char}`)
    value = value * BASE + digit
  }
  return value
}

// Module-level, per-process — consistent with the throttle
// (middleware/throttle.ts) already being in-memory and single-process
// rather than distributed; not a new limitation this file introduces.
let lastTimestamp = -1
let counter = 0

function nextCounter(timestampMs: number): number {
  if (timestampMs !== lastTimestamp) {
    lastTimestamp = timestampMs
    counter = 0
  } else {
    counter += 1
  }
  return counter % BASE ** COUNTER_LENGTH
}

export function randomRowId(now: number = Date.now()): string {
  return encodeBase31(now, TIMESTAMP_LENGTH) + encodeBase31(nextCounter(now), COUNTER_LENGTH)
}

/** Returns null for an id that predates this scheme (e.g. the old base64url ids) rather than throwing. */
export function createdTimeFromRowId(id: string): string | null {
  if (id.length < TIMESTAMP_LENGTH) return null
  try {
    return new Date(decodeBase31(id.slice(0, TIMESTAMP_LENGTH))).toISOString()
  } catch {
    return null
  }
}
