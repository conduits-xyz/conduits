import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createMemoryIdempotencyStore, type IdempotencyStore } from '../middleware/idempotency.ts'
import { createSqliteIdempotencyStore } from '../middleware/sqlite-idempotency-store.ts'
import { createFakeGateway } from './fake-gateway.ts'

const DAY_MS = 24 * 60 * 60 * 1000

// The stores the keys can be kept in; each test below runs on each.
const stores: [string, () => IdempotencyStore][] = [
  ['memory', createMemoryIdempotencyStore],
  ['SQLite', () => createSqliteIdempotencyStore(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'idempotency-')), 'idempotency.db'))],
]

// A conduit on a router with the given store, and POSTs with a key.
function conduit(store: IdempotencyStore) {
  const gateway = createFakeGateway('idempotency')
  const { curi } = gateway
  const router = gateway.makeRouter(gateway.baseConfig(), { idempotency: { store, ttlMs: DAY_MS } })
  const post = (fields: Record<string, unknown>, key?: string) =>
    router.fetch(new Request(`http://gateway.test/${curi}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key === undefined ? {} : { 'idempotency-key': key }) },
      body: JSON.stringify({ fields }),
    }))
  const records = async () => ((await (await router.fetch(new Request(`http://gateway.test/${curi}`))).json()) as { records: unknown[] }).records
  return { gateway, post, records, store, curi }
}

for (const [name, makeStore] of stores) {
  describe(`idempotency keys (${name} store)`, () => {
    it('creates once for a key, and gives a repeat the first response again', async () => {
      const { post, records } = conduit(makeStore())
      const first = await post({ name: 'Ada' }, 'order-1')
      const repeat = await post({ name: 'Ada' }, 'order-1')
      assert.equal(first.status, 201)
      assert.equal(repeat.status, 201)
      assert.equal(repeat.headers.get('idempotent-replayed'), 'true')
      assert.equal(first.headers.get('idempotent-replayed'), null)
      assert.deepEqual(await repeat.json(), await first.json())
      assert.equal((await records()).length, 1)
    })

    it('refuses the key with another body (422)', async () => {
      const { post } = conduit(makeStore())
      await post({ name: 'Ada' }, 'order-1')
      const reused = await post({ name: 'Grace' }, 'order-1')
      assert.equal(reused.status, 422)
      assert.equal(((await reused.json()) as { code: string }).code, 'idempotency_key_reused')
    })

    it('says a claimed key is running until its response is kept, and frees a released one', async () => {
      const store = makeStore()
      const at = Date.UTC(2026, 9, 5, 12)
      assert.deepEqual(await store.claim('c', 'k', 'f', at, DAY_MS), { kind: 'new' })
      assert.deepEqual(await store.claim('c', 'k', 'f', at, DAY_MS), { kind: 'running' })
      await store.release('c', 'k')
      assert.deepEqual(await store.claim('c', 'k', 'f', at, DAY_MS), { kind: 'new' })
    })

    it('replays a source failure rather than try again, so a send whose outcome is unknown is not repeated', async () => {
      const { gateway, post } = conduit(makeStore())
      gateway.sheets.failAuth(gateway.suriObjectKey)
      const failed = await post({ name: 'Ada' }, 'order-1')
      assert.equal(failed.status, 502)
      const repeat = await post({ name: 'Ada' }, 'order-1')
      assert.equal(repeat.status, 502)
      assert.equal(repeat.headers.get('idempotent-replayed'), 'true')
    })

    it('frees a key once it has been kept for the TTL', async () => {
      const { gateway, post, records } = conduit(makeStore())
      await post({ name: 'Ada' }, 'order-1')
      gateway.clock.advance(DAY_MS)
      const later = await post({ name: 'Ada' }, 'order-1')
      assert.equal(later.headers.get('idempotent-replayed'), null)
      assert.equal((await records()).length, 2)
    })
  })
}

describe('idempotency keys', () => {
  it('answers a key whose request is still running with 409 and Retry-After', async () => {
    const running: IdempotencyStore = { claim: async () => ({ kind: 'running' }), complete: async () => {}, release: async () => {} }
    const response = await conduit(running).post({ name: 'Ada' }, 'order-1')
    assert.equal(response.status, 409)
    assert.equal(((await response.json()) as { code: string }).code, 'idempotency_key_in_use')
    assert.equal(response.headers.get('retry-after'), '1')
  })

  it('refuses a key that is not 1 to 255 visible ASCII characters (400), and creates without a key as before', async () => {
    const { post, records } = conduit(createMemoryIdempotencyStore())
    for (const key of ['', 'with space', 'x'.repeat(256)]) {
      const refused = await post({ name: 'Ada' }, key)
      assert.equal(refused.status, 400)
      assert.equal(((await refused.json()) as { code: string }).code, 'invalid_idempotency_key')
    }
    assert.equal((await post({ name: 'Ada' })).status, 201)
    assert.equal((await post({ name: 'Ada' })).status, 201)
    assert.equal((await records()).length, 2)
  })
})
