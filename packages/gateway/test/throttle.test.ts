import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createMemoryThrottleStore, type ThrottleLimits, type ThrottleStore } from '../middleware/throttle.ts'
import { createSqliteThrottleStore } from '../middleware/sqlite-throttle-store.ts'
import { createFakeGateway } from './fake-gateway.ts'

const limits: ThrottleLimits = { requests: 5, windowMs: 1000, banAfter: 8, banMs: 60_000 }

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'throttle-')), 'throttle.db')

// The stores the throttle runs on; each test below runs on each.
const stores: [string, () => ThrottleStore][] = [
  ['memory', createMemoryThrottleStore],
  ['SQLite', () => createSqliteThrottleStore(tempFile())],
]

// A conduit (`curi`, else a new one) whose router has the given throttle
// store, and GETs with an X-Forwarded-For (none when not given).
function throttled(store: ThrottleStore, trustedForwarders: string[] = [], curi?: string) {
  const gateway = createFakeGateway('throttle', curi)
  const router = gateway.makeRouter(gateway.baseConfig(), { throttle: { limits, store }, trustedForwarders })
  const get = (forwardedFor?: string) => router.fetch(new Request(`http://gateway.test/${gateway.curi}`, forwardedFor ? { headers: { 'x-forwarded-for': forwardedFor } } : {}))
  const statuses = async (n: number, forwardedFor?: string) => {
    const out: number[] = []
    for (let i = 0; i < n; i++) out.push((await get(forwardedFor)).status)
    return out
  }
  return { curi: gateway.curi, clock: gateway.clock, get, statuses }
}

for (const [name, makeStore] of stores) describe(`throttle (${name} store)`, () => {
  it('refuses an address over the limit until the window ends, with the wait in the body and header', async () => {
    const { clock, get, statuses } = throttled(makeStore())
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
    const { statuses } = throttled(makeStore())
    assert.deepEqual(await statuses(6, '203.0.113.1'), [200, 200, 200, 200, 200, 429])
    assert.equal((await statuses(1, '203.0.113.2'))[0], 200)
    assert.deepEqual(await statuses(6), [200, 200, 200, 200, 200, 429])
  })

  it("counts a trusted forwarder's visitors separately", async () => {
    const { statuses } = throttled(makeStore(), ['10.0.0.5'])
    assert.deepEqual(await statuses(6, '198.51.100.1, 10.0.0.5'), [200, 200, 200, 200, 200, 429])
    assert.equal((await statuses(1, '198.51.100.2, 10.0.0.5'))[0], 200)
  })

  it('bans an address that keeps sending, for banMs, across windows', async () => {
    const { clock, get, statuses } = throttled(makeStore())
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

describe('throttle (SQLite store) across processes and restarts', () => {
  it('shares counts between two stores on one file, as two processes would', async () => {
    const file = tempFile()
    const first = throttled(createSqliteThrottleStore(file))
    const second = throttled(createSqliteThrottleStore(file), [], first.curi)
    assert.deepEqual(await first.statuses(3, '203.0.113.1'), [200, 200, 200])
    assert.deepEqual(await second.statuses(3, '203.0.113.1'), [200, 200, 429])
  })

  it('keeps a ban when the store is opened again, as after a restart', async () => {
    const file = tempFile()
    const store = createSqliteThrottleStore(file)
    const before = throttled(store)
    await before.statuses(8, '203.0.113.1')
    store.close()
    const after = throttled(createSqliteThrottleStore(file), [], before.curi)
    assert.equal((await after.get('203.0.113.1')).status, 429)
  })
})
