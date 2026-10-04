import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { ConduitRateLimitError, type ConduitSourceClient } from '@conduits/conduit'

import { createGatewayRouter } from '../router.ts'
import { decodeListCursor, encodeListCursor } from '../controller.ts'
import { createStaticRouteResolver } from '../route-binding.ts'
import type { ConduitConfig, GatewayDeps } from '../index.ts'

// GET on a conduit: page sizes from the caller's listLimits, an opaque
// cursor, and 429 when the source is rate-limited.

const runtime = {
  async getCredential() {
    return 'fake-credential'
  },
  async invalidateCredential() {},
}

function router(curi: string, overrides: Partial<GatewayDeps> = {}) {
  const config: ConduitConfig = {
    curi,
    allowlist: [],
    racm: ['GET', 'POST'],
    throttle: false,
    tokenRequiredMethods: [],
    apiKeys: [],
    suriType: 'googleSheets',
    suriObjectKey: `${curi}-sheet`,
    suriConfig: {},
    hiddenFormField: [],
    credentialRef: null,
  }
  return createGatewayRouter({
    resolveConfig: async (requested) => (requested === curi ? config : null),
    resolveRoute: createStaticRouteResolver([{ path: `/${curi}`, curi }]),
    runtime,
    listLimits: { default: 2, max: 3 },
    ...overrides,
  })
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

  it("answers 429 with Retry-After when the source is rate-limited", async () => {
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
    assert.equal(response.status, 429)
    assert.equal(response.headers.get('retry-after'), '17')
  })
})
