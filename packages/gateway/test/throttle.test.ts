import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createMemoryThrottleStore, type ThrottleLimits } from '../middleware/throttle.ts'
import { createFakeGateway } from './fake-gateway.ts'

const limits: ThrottleLimits = { requests: 5, windowMs: 1000, banAfter: 8, banMs: 60_000 }

// A conduit whose router has its own throttle store, and GETs with an
// X-Forwarded-For (none when not given).
function throttled(trustedForwarders: string[] = []) {
  const curi = `throttle-${Math.random().toString(36).slice(2)}`
  const gateway = createFakeGateway(curi)
  const router = gateway.makeRouter(gateway.baseConfig(), { throttle: { limits, store: createMemoryThrottleStore() }, trustedForwarders })
  const get = (forwardedFor?: string) => router.fetch(new Request(`http://gateway.test/${curi}`, forwardedFor ? { headers: { 'x-forwarded-for': forwardedFor } } : {}))
  const statuses = async (n: number, forwardedFor?: string) => {
    const out: number[] = []
    for (let i = 0; i < n; i++) out.push((await get(forwardedFor)).status)
    return out
  }
  return { clock: gateway.clock, get, statuses }
}

describe('throttle', () => {
  it('refuses an address over the limit until the window ends, with the wait in the body and header', async () => {
    const { clock, get, statuses } = throttled()
    assert.deepEqual(await statuses(5, '203.0.113.1'), [200, 200, 200, 200, 200])
    clock.advance(400)
    const refused = await get('203.0.113.1')
    assert.equal(refused.status, 429)
    const body = (await refused.json()) as { code: string; retryAfter: number }
    assert.equal(body.code, 'rate_limited')
    assert.equal(body.retryAfter, 1)
    assert.equal(refused.headers.get('retry-after'), '1')

    clock.advance(600)
    assert.equal((await get('203.0.113.1')).status, 200)
  })

  it('counts each address separately, and requests without an address together', async () => {
    const { statuses } = throttled()
    assert.deepEqual(await statuses(6, '203.0.113.1'), [200, 200, 200, 200, 200, 429])
    assert.equal((await statuses(1, '203.0.113.2'))[0], 200)
    assert.deepEqual(await statuses(6), [200, 200, 200, 200, 200, 429])
  })

  it("counts a trusted forwarder's visitors separately", async () => {
    const { statuses } = throttled(['10.0.0.5'])
    assert.deepEqual(await statuses(6, '198.51.100.1, 10.0.0.5'), [200, 200, 200, 200, 200, 429])
    assert.equal((await statuses(1, '198.51.100.2, 10.0.0.5'))[0], 200)
  })

  it('bans an address that keeps sending, for banMs, across windows', async () => {
    const { clock, get, statuses } = throttled()
    assert.deepEqual(await statuses(8, '203.0.113.1'), [200, 200, 200, 200, 200, 429, 429, 429])
    clock.advance(1000)
    const banned = await get('203.0.113.1')
    assert.equal(banned.status, 429)
    assert.equal(((await banned.json()) as { retryAfter: number }).retryAfter, 59)
    assert.equal((await get('203.0.113.2')).status, 200)

    clock.advance(59_000)
    assert.equal((await get('203.0.113.1')).status, 200)
  })
})
