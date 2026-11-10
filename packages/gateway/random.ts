import { randomBytes } from 'node:crypto'
import { BASE31_ALPHABET as ALPHABET } from '@conduits/conduit'

// Row ids' alphabet (row-id.ts in @conduits/conduit), without 0, 1, i,
// l and o, which are easily confused.
// The largest multiple of 31 in a byte; higher bytes are redrawn so
// every symbol is equally likely.
const BYTE_ACCEPT_LIMIT = 248

// `length` random base-31 symbols, about 4.95 bits each.
export function randomBase31(length: number): string {
  let text = ''
  while (text.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= BYTE_ACCEPT_LIMIT) continue
      text += ALPHABET[byte % ALPHABET.length]
      if (text.length === length) break
    }
  }
  return text
}
