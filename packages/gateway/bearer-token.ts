import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

// Base31 leaves out 0, 1, i, l and o, which are easily confused. 32
// symbols is about 158 bits.
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const TOKEN_LENGTH = 32
// The largest multiple of 31 in a byte; higher bytes are redrawn so
// every symbol is equally likely.
const BYTE_ACCEPT_LIMIT = 248

export function generateBearerToken(): string {
  let token = ''
  while (token.length < TOKEN_LENGTH) {
    for (const byte of randomBytes(TOKEN_LENGTH)) {
      if (byte >= BYTE_ACCEPT_LIMIT) continue
      token += ALPHABET[byte % ALPHABET.length]
      if (token.length === TOKEN_LENGTH) break
    }
  }
  return token
}

export function hashBearerToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function verifyBearerToken(token: string, hash: string): boolean {
  const candidate = Buffer.from(hashBearerToken(token), 'hex')
  const stored = Buffer.from(hash, 'hex')
  if (candidate.length !== stored.length) return false
  return timingSafeEqual(candidate, stored)
}
