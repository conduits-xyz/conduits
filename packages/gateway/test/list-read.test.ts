import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { ConduitRateLimitError, type ConduitSourceClient } from '@conduits/conduit'

import { decodeListCursor, encodeListCursor } from '../controller.ts'
import { generateBearerToken, hashBearerToken, type GatewayDeps } from '../index.ts'
import { createFakeGateway } from './fake-gateway.ts'

// GET on a conduit: page sizes from the caller's listLimits, an opaque
// cursor, and 503 when the source is rate-limited.

const LIMITS = { listLimits: { default: 2, max: 3 } }

function router(curi: string, deps: Partial<GatewayDeps> = {}) {
  const gateway = createFakeGateway(curi)
  return gateway.makeRouter(gateway.baseConfig(), { ...LIMITS, ...deps })
}

async function seed(curi: string, count: number) {
  const r = router(curi)
  for (let i = 0; i < count; i++) {
    const response = await r.fetch(
      new Request(`http://gateway.test/${curi}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: { name: `row ${i}` } }) }),
    )
    assert.equal(response.status, 201)
  }
  return r
}

describe('list read', () => {
  it('returns the default number of rows without a limit, and an opaque cursor that reaches every row', async () => {
    const curi = `list-${Math.random().toString(36).slice(2)}`
    const r = await seed(curi, 5)
    const seen: string[] = []
    let url = `http://gateway.test/${curi}`
    for (;;) {
      const body = (await (await r.fetch(new Request(url))).json()) as { records: { fields: { name: string } }[]; nextCursor: string | null }
      assert.ok(body.records.length <= 2)
      seen.push(...body.records.map((record) => record.fields.name))
      if (!body.nextCursor) break
      assert.doesNotMatch(body.nextCursor, /^\d+$/, 'the cursor is not a bare offset')
      url = `http://gateway.test/${curi}?cursor=${encodeURIComponent(body.nextCursor)}`
    }
    assert.deepEqual(seen, ['row 0', 'row 1', 'row 2', 'row 3', 'row 4'])
  })

  it('refuses a limit above the maximum, and a cursor it did not make', async () => {
    const curi = `list-${Math.random().toString(36).slice(2)}`
    const r = await seed(curi, 1)
    assert.equal((await r.fetch(new Request(`http://gateway.test/${curi}?limit=4`))).status, 400)
    assert.equal((await r.fetch(new Request(`http://gateway.test/${curi}?limit=3`))).status, 200)
    assert.equal((await r.fetch(new Request(`http://gateway.test/${curi}?cursor=not-a-cursor`))).status, 400)
  })

  it('accepts only cursors it made', async () => {
    assert.equal(decodeListCursor(encodeListCursor('7')), '7')
    assert.equal(decodeListCursor('2'), null)
    assert.equal(decodeListCursor('e30'), null)
  })

  it('answers 503 source_busy with Retry-After when the source is rate-limited', async () => {
    const limited: ConduitSourceClient = {
      async connect() {
        return {
          async listTables() {
            return []
          },
          open() {
            return {
              async listRecords() {
                throw new ConduitRateLimitError('googleSheets', 'budget used', 17)
              },
            } as never
          },
        }
      },
      async disconnect() {},
      capabilities() {
        return { bulkCreate: true }
      },
    } as unknown as ConduitSourceClient
    const curi = `list-${Math.random().toString(36).slice(2)}`
    const response = await router(curi, { sourceClients: { googleSheets: limited } }).fetch(new Request(`http://gateway.test/${curi}`))
    assert.equal(response.status, 503)
    assert.equal(((await response.json()) as { code: string }).code, 'source_busy')
    assert.equal(response.headers.get('retry-after'), '17')
  })

  it('uses the given source client for the schema too', async () => {
    const limited = {
      async connect() {
        return {
          async listTables() {
            return []
          },
          open() {
            return {
              async describeFields() {
                throw new ConduitRateLimitError('googleSheets', 'budget used', 17)
              },
            } as never
          },
        }
      },
      async disconnect() {},
      capabilities() {
        return { bulkCreate: true }
      },
    } as unknown as ConduitSourceClient
    const curi = `list-${Math.random().toString(36).slice(2)}`
    const gateway = createFakeGateway(curi)
    const token = generateBearerToken()
    const config = gateway.baseConfig({ apiKeys: [{ tokenHash: hashBearerToken(token), scopes: ['GET'] }] })
    const response = await gateway
      .makeRouter(config, { ...LIMITS, sourceClients: { googleSheets: limited } })
      .fetch(new Request(`http://gateway.test/${curi}/.conduits/schema`, { headers: { authorization: `Bearer ${token}` } }))
    assert.equal(response.status, 503)
  })
})
