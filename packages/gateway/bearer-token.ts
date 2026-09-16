import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

// Excludes characters visually confusable with each other or with digits
// (0/1/i/l/o). 32 chars from a 32-symbol alphabet is 160 bits of entropy.
const ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz'
const TOKEN_LENGTH = 32

export function generateBearerToken(): string {
  const bytes = randomBytes(TOKEN_LENGTH)
  let token = ''
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += ALPHABET[bytes[i]! % ALPHABET.length]
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
