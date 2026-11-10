import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { generateBearerToken, hashBearerToken } from '../bearer-token.ts'
import { createMemoryThrottleStore } from '../middleware/throttle.ts'
import { fakeConduit, fakeRuntime } from './fake-gateway.ts'

// Who may call a conduit: the allowlist before RACM, RACM before API
// keys, the schema route's own key, and readyz, which only the
// allowlist and throttle apply to.

const ALLOWLISTED = '203.0.113.9'
const from = (address: string): RequestInit => ({ headers: { 'x-forwarded-for': address } })

describe('access', () => {
  it('refuses an address off the allowlist with a plain 403 before RACM, so no Allow header shows the methods', async () => {
    const { send, json } = fakeConduit('access', { racm: ['GET'], allowlist: [{ ip: ALLOWLISTED, status: 'active' }] })

    const refused = await json('POST', '', { fields: { name: 'bot' } })
    assert.equal(refused.status, 403)
    assert.equal(refused.headers.get('allow'), null)
    assert.equal((await send('', from(ALLOWLISTED))).status, 200)
  })

  it('lets every address through an allowlist whose entries are all inactive', async () => {
    const { send } = fakeConduit('access', { allowlist: [{ ip: ALLOWLISTED, status: 'inactive' }] })
    assert.equal((await send('', from('198.51.100.1'))).status, 200)
  })

  it('asks for a key only on the methods that need one, and takes only an active key in scope', async () => {
    const token = generateBearerToken()
    const { send, json } = fakeConduit('access', { racm: ['GET', 'PATCH'], tokenRequiredMethods: ['PATCH'], apiKeys: [{ tokenHash: hashBearerToken(token), scopes: ['PATCH'] }] })
    const patch = (authorization?: string) => json('PATCH', '/some-id', { fields: { name: 'x' } }, authorization ? { authorization } : {})

    assert.equal((await send()).status, 200)
    assert.equal((await patch()).status, 401)
    assert.equal((await patch('Basic not-a-bearer-token')).status, 401)
    assert.equal((await patch(`Bearer ${generateBearerToken()}`)).status, 401)
    // Past the key, to the record, which doesn't exist.
    assert.equal((await patch(`Bearer ${token}`)).status, 404)
  })

  it('refuses a method that needs a key when the conduit has none (401)', async () => {
    const { send } = fakeConduit('access', { racm: ['GET'], tokenRequiredMethods: ['GET'] })
    assert.equal((await send()).status, 401)
  })

  it('refuses a method RACM leaves out with 405 even when it also needs a key, so the 401 does not show the key requirement', async () => {
    const token = generateBearerToken()
    const { send } = fakeConduit('access', { racm: ['GET'], tokenRequiredMethods: ['DELETE'], apiKeys: [{ tokenHash: hashBearerToken(token), scopes: ['DELETE'] }] })
    assert.equal((await send('/some-id', { method: 'DELETE' })).status, 405)
  })

  it('asks for a key on the schema route even when no method needs one, and for any key the conduit has', async () => {
    const token = generateBearerToken()
    const keyless = fakeConduit('access')
    assert.equal((await keyless.send('/.conduits/schema')).status, 401)
    assert.equal((await keyless.send()).status, 200)

    const keyed = fakeConduit('access', { apiKeys: [{ tokenHash: hashBearerToken(token), scopes: ['POST'] }] })
    assert.equal((await keyed.send('/.conduits/schema', { headers: { authorization: `Bearer ${token}` } })).status, 200)
  })
})

describe('readyz', () => {
  it('answers 204 to anyone for a write-only conduit, with no key, and without asking for its credential', async () => {
    let asked = 0
    const runtime = {
      ...fakeRuntime,
      getCredential: async () => {
        asked++
        return null
      },
    }
    const { send } = fakeConduit('readyz', { racm: ['POST'], tokenRequiredMethods: ['POST'] }, { runtime })

    assert.equal((await send('/.conduits/readyz')).status, 204)
    assert.equal((await send()).status, 405)
    assert.equal(asked, 0)
  })

  it('applies the allowlist', async () => {
    const { send } = fakeConduit('access', { allowlist: [{ ip: ALLOWLISTED, status: 'active' }] })
    assert.equal((await send('/.conduits/readyz')).status, 403)
    assert.equal((await send('/.conduits/readyz', from(ALLOWLISTED))).status, 204)
  })

  it('counts against the same throttle as the conduit', async () => {
    const limits = { requests: 2, windowMs: 1000, banAfter: 100, banMs: 1000 }
    const { send } = fakeConduit('access', {}, { throttle: { limits, store: createMemoryThrottleStore() } })
    assert.equal((await send('', from(ALLOWLISTED))).status, 200)
    assert.equal((await send('/.conduits/readyz', from(ALLOWLISTED))).status, 204)
    assert.equal((await send('/.conduits/readyz', from(ALLOWLISTED))).status, 429)
  })
})
