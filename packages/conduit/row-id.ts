// Row ids: a fixed-width base-31 timestamp, so `createdTime` is decoded
// from the id rather than stored.
//
// The alphabet leaves out 0, 1, i, l and o, which are easily confused.
// Fixed width and an ascending alphabet make string order equal numeric
// order, so ids sort by creation time; nothing here may break that.
export const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const BASE = ALPHABET.length // 31
const TIMESTAMP_LENGTH = 9 // 31^9 ~= 1.75e13 ms ~= year 2525 — plenty of headroom

// A per-millisecond counter breaks ties, so ids made in the same
// millisecond still sort in creation order. Three digits allow 31^3
// (29,791) ids per millisecond. A bulk create (at most 10 records,
// record-shape.ts) generates all its ids in one loop, so same-millisecond
// ids are common.
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

// Per process, like the throttle (middleware/throttle.ts).
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

/** null for an id not in this format, rather than throwing. */
export function createdTimeFromRowId(id: string): string | null {
  if (id.length < TIMESTAMP_LENGTH) return null
  try {
    return new Date(decodeBase31(id.slice(0, TIMESTAMP_LENGTH))).toISOString()
  } catch {
    return null
  }
}
