import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { generateBearerToken, hashBearerToken, verifyBearerToken } from '../bearer-token.ts'

describe('generateBearerToken', () => {
  it('returns 32 base31 characters', () => {
    for (let i = 0; i < 200; i++) assert.match(generateBearerToken(), /^[23456789abcdefghjkmnpqrstuvwxyz]{32}$/)
  })

  it('verifies against its own hash and not against another token', () => {
    const token = generateBearerToken()
    assert.equal(verifyBearerToken(token, hashBearerToken(token)), true)
    assert.equal(verifyBearerToken(generateBearerToken(), hashBearerToken(token)), false)
  })
})
