import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { ConduitCursorError, ConduitRateLimitError, type ConduitSourceClient, type ConduitTable } from '@conduits/conduit'

import { generateBearerToken, hashBearerToken, type GatewayDeps } from '../index.ts'
import { fakeConduit } from './fake-gateway.ts'

// GET on a conduit: page sizes from the caller's listLimits, an opaque
// cursor, 400 when the record a cursor follows is gone, and 503 when the
// source is rate-limited.

const LIMITS = { listLimits: { default: 2, max: 3 } }

// A conduit with LIMITS and `deps`.
const listing = (deps: Partial<GatewayDeps> = {}, overrides: Parameters<typeof fakeConduit>[1] = {}) => fakeConduit('list', overrides, { ...LIMITS, ...deps })

// A conduit with `count` records, row 0 first.
async function seed(count: number) {
  const conduit = listing()
  for (let i = 0; i < count; i++) assert.equal((await conduit.json('POST', '', { fields: { name: `row ${i}` } })).status, 201)
  return conduit
}

// A source whose table throws `error` from `method`.
function sourceThrowing(method: keyof ConduitTable, error: Error): ConduitSourceClient {
  return {
    async connect() {
      return {
        async listTables() {
          return []
        },
        open: () => ({ [method]: async () => { throw error } }) as unknown as ConduitTable,
      }
    },
    async disconnect() {},
    capabilities: () => ({ bulkCreate: true }),
  } as unknown as ConduitSourceClient
}

describe('list read', () => {
  it('returns the default number of rows without a limit, and an opaque cursor that reaches every row', async () => {
    const { send } = await seed(5)
    const seen: string[] = []
    let query = ''
    for (;;) {
      const body = (await (await send(query)).json()) as { records: { fields: { name: string } }[]; nextCursor: string | null }
      assert.ok(body.records.length <= 2)
      seen.push(...body.records.map((record) => record.fields.name))
      if (!body.nextCursor) break
      assert.doesNotMatch(body.nextCursor, /^\d+$/, 'the cursor is not a bare offset')
      query = `?cursor=${encodeURIComponent(body.nextCursor)}`
    }
    assert.deepEqual(seen, ['row 0', 'row 1', 'row 2', 'row 3', 'row 4'])
  })

  it('refuses a limit that is not a whole number from 1 to the maximum, and a cursor it did not make', async () => {
    const { send } = await seed(1)
    for (const limit of ['4', '0', '-1', 'abc']) assert.equal((await send(`?limit=${limit}`)).status, 400, limit)
    assert.equal((await send('?limit=3')).status, 200)
    // Not base64 JSON, a bare offset, and base64 JSON of {}.
    for (const cursor of ['not-a-cursor', '2', 'e30']) assert.equal((await send(`?cursor=${cursor}`)).status, 400, cursor)
  })

  it('answers 503 source_busy with Retry-After when the source is rate-limited', async () => {
    const limited = sourceThrowing('listRecords', new ConduitRateLimitError('googleSheets', 'budget used', 17))
    const response = await listing({ sourceClients: { googleSheets: limited } }).send()
    assert.equal(response.status, 503)
    assert.equal(((await response.json()) as { code: string }).code, 'source_busy')
    assert.equal(response.headers.get('retry-after'), '17')
  })

  it('answers 400 unknown_cursor when the record a cursor follows is gone', async () => {
    const { nextCursor } = (await (await (await seed(3)).send()).json()) as { nextCursor: string }
    const lost = sourceThrowing('listRecords', new ConduitCursorError('fastmail', 'gone'))
    const response = await listing({ sourceClients: { googleSheets: lost } }).send(`?cursor=${encodeURIComponent(nextCursor)}`)
    assert.equal(response.status, 400)
    assert.equal(((await response.json()) as { code: string }).code, 'unknown_cursor')
  })

  it('uses the given source client for the schema too', async () => {
    const limited = sourceThrowing('describeFields', new ConduitRateLimitError('googleSheets', 'budget used', 17))
    const token = generateBearerToken()
    const { send } = listing({ sourceClients: { googleSheets: limited } }, { apiKeys: [{ tokenHash: hashBearerToken(token), scopes: ['GET'] }] })
    const response = await send('/.conduits/schema', { headers: { authorization: `Bearer ${token}` } })
    assert.equal(response.status, 503)
  })
})
