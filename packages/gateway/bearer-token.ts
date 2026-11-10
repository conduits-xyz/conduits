import { createHash, timingSafeEqual } from 'node:crypto'

import { randomBase31 } from './random.ts'

// 32 base-31 symbols, about 158 bits.
const TOKEN_LENGTH = 32

export function generateBearerToken(): string {
  return randomBase31(TOKEN_LENGTH)
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
