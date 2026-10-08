import * as assert from 'remix/assert'
import { describe, it, afterEach } from 'remix/test'

import { createGoogleSheetsClient, ConduitAuthError, ConduitRateLimitError, ConduitSourceError } from '../sheets.ts'
import { ConduitUnknownFieldError } from '../field-map.ts'
import { jsonResponse, replaceFetch } from './helpers.ts'

// The Sheets client with a mocked fetch: request building, error
// mapping and the metadata cache.

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

// The client's options, with a fetch that calls whatever global fetch
// mockFetch has installed when the request is made.
const sheetsOptions = () => ({ apiUrl: SHEETS_API, fetch: ((input, init) => globalThis.fetch(input, init)) as typeof fetch, now: Date.now, readCacheMs: 0 })

// A new client's source for sheet-1, opened with `token`.
const connectSheet = (token = 'good-token') => createGoogleSheetsClient(sheetsOptions()).connect('sheet-1', token)

type Call = { url: string; method: string; body: unknown; authorization: string | undefined }

// Throws on any request with no matching route, so a missing route
// fails the test instead of reaching the network.
function mockFetch(handler: (url: string, method: string, body: unknown) => Response): { calls: Call[]; restore: () => void } {
  const calls: Call[] = []
  const restore = replaceFetch((url, init) => {
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization
    calls.push({ url, method, body, authorization })
    return handler(url, method, body)
  })
  return { calls, restore }
}

describe('Sheets HTTP client (mocked fetch — real request/response shapes)', () => {
  let restore: (() => void) | undefined
  afterEach(() => {
    restore?.()
    restore = undefined
  })

  describe('request building — reads', () => {
    it('reads the grid with a Bearer token, no table quoting when no table is configured', async () => {
      const mock = mockFetch((url) => {
        assert.equal(url, `${SHEETS_API}/sheet-1/values/A:ZZ?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`)
        return jsonResponse({ values: [['conduit-id', 'name'], ['r1', 'Ada']] })
      })
      restore = mock.restore

      const source = await connectSheet()
      const { records } = await source.open().listRecords()

      assert.equal(records.length, 1)
      assert.equal(mock.calls[0]?.method, 'GET')
      assert.equal(mock.calls[0]?.authorization, 'Bearer good-token')
    })

    it('quotes a table name in the range, doubling any embedded single quotes', async () => {
      const mock = mockFetch((url) => {
        assert.equal(url, `${SHEETS_API}/sheet-1/values/'Q&A''s'!A:ZZ?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`)
        return jsonResponse({ values: [] })
      })
      restore = mock.restore

      const source = await connectSheet()
      await source.open(JSON.stringify({ table: "Q&A's" })).listRecords()
    })

    it('listTables reads sheet titles via the fields-filtered spreadsheet-metadata endpoint', async () => {
      const mock = mockFetch((url) => {
        assert.equal(url, `${SHEETS_API}/sheet-1?fields=sheets.properties.title`)
        return jsonResponse({ sheets: [{ properties: { title: 'Sheet1' } }, { properties: { title: 'Archive' } }] })
      })
      restore = mock.restore

      const source = await connectSheet()
      const tables = await source.listTables()
      assert.deepEqual(tables, ['Sheet1', 'Archive'])
    })
  })

  describe('request building — writes', () => {
    it('bootstraps a missing id column before appending, backfilling every existing row with a generated id', async () => {
      const mock = mockFetch((url, method, body) => {
        if (method === 'GET') {
          // A header with a field column but no conduit-id column, and
          // one data row. createRecord reads the grid once.
          return jsonResponse({ values: [['name'], ['Old Row']] })
        }
        if (url.endsWith('/values:batchUpdate')) {
          const data = (body as { data: Array<{ range: string; values: string[][] }> }).data
          // The new column's header cell and a backfilled id for the
          // existing row, both in column B.
          assert.equal(data.length, 2)
          assert.equal(data[0]?.range, 'B1')
          assert.deepEqual(data[0]?.values, [['conduit-id']])
          assert.equal(data[1]?.range, 'B2')
          assert.equal(typeof data[1]?.values[0]?.[0], 'string')
          assert.ok((data[1]?.values[0]?.[0] as string).length > 0, 'the existing row gets a real, non-empty backfilled id')
          return jsonResponse({})
        }
        if (url.includes(':append')) {
          const values = (body as { values: string[][] }).values
          // The new column is appended after the existing ones.
          assert.equal(values.length, 1)
          assert.equal(values[0]?.[0], 'Ada')
          assert.equal(typeof values[0]?.[1], 'string')
          assert.ok((values[0]?.[1] as string).length > 0, 'the new row gets a real, non-empty id in the conduit-id column')
          return jsonResponse({})
        }
        throw new Error(`unexpected call: ${method} ${url}`)
      })
      restore = mock.restore

      const source = await connectSheet()
      const record = await source.open().createRecord({ name: 'Ada' })
      assert.equal(record.fields.name, 'Ada')
      assert.ok(record.id.length > 0)
    })

    it('rejects an unrecognized field name on an already-typed sheet without ever writing a column', async () => {
      const mock = mockFetch((url, method) => {
        if (method === 'GET') return jsonResponse({ values: [['conduit-id', 'name'], ['r1', 'Ada']] })
        throw new Error(`unexpected write call: ${method} ${url}`)
      })
      restore = mock.restore

      const source = await connectSheet()
      await assert.rejects(() => source.open().createRecord({ unknownField: 'x' }), ConduitUnknownFieldError)
    })

    // RAW: Sheets never parses a value, so text a visitor sends can't
    // become a formula, and '01234' keeps its zero.
    it('writes values as given (RAW), appending and updating alike', async () => {
      const mock = mockFetch((url, method) => {
        if (method === 'GET' && url.includes('/values/')) return jsonResponse({ values: [['conduit-id', 'note', 'guests'], ['r1', 'a', 1]] })
        if (method === 'POST') return jsonResponse({})
        throw new Error(`unexpected call: ${method} ${url}`)
      })
      restore = mock.restore

      const table = (await connectSheet()).open()
      await table.createRecord({ note: '=IMPORTXML("x")', guests: 12 })
      await table.updateRecord({ id: 'r1', fields: { note: '01234' } })
      const [append, update] = mock.calls.filter((call) => call.method === 'POST')
      assert.match(append!.url, /valueInputOption=RAW/)
      assert.deepEqual((append!.body as { values: unknown[][] }).values[0]!.slice(1, 3), ['=IMPORTXML("x")', 12])
      assert.equal((update!.body as { valueInputOption: string }).valueInputOption, 'RAW')
    })

    it('bulk delete orders deleteDimension requests highest-row-index-first', async () => {
      const mock = mockFetch((url, method, body) => {
        if (method === 'GET' && url.includes('/values/')) {
          return jsonResponse({
            values: [['conduit-id'], ['r1'], ['r2'], ['r3']],
          })
        }
        if (method === 'GET' && url.includes('fields=sheets.properties(sheetId,title)')) {
          return jsonResponse({ sheets: [{ properties: { sheetId: 42, title: 'Sheet1' } }] })
        }
        if (url.endsWith(':batchUpdate') && !url.includes('/values')) {
          const requests = (body as { requests: Array<{ deleteDimension: { range: { startIndex: number } } }> }).requests
          const indexes = requests.map((r) => r.deleteDimension.range.startIndex)
          // r1, r2 and r3 are rows 1 to 3 (row 0 is the header), deleted
          // highest first so earlier deletes don't shift later indexes.
          assert.deepEqual(indexes, [3, 2, 1])
          return jsonResponse({})
        }
        throw new Error(`unexpected call: ${method} ${url}`)
      })
      restore = mock.restore

      const source = await connectSheet()
      const ok = await source.open().deleteRecords(['r1', 'r2', 'r3'])
      assert.equal(ok, true)
    })

    it('bulk delete resolves nothing and writes nothing when any id fails to resolve', async () => {
      let batchUpdateCalled = false
      const mock = mockFetch((url, method) => {
        if (method === 'GET' && url.includes('/values/')) {
          return jsonResponse({ values: [['conduit-id'], ['r1']] }) // 'r2' doesn't exist
        }
        if (url.endsWith(':batchUpdate')) {
          batchUpdateCalled = true
          return jsonResponse({})
        }
        throw new Error(`unexpected call: ${method} ${url}`)
      })
      restore = mock.restore

      const source = await connectSheet()
      const ok = await source.open().deleteRecords(['r1', 'r2'])
      assert.equal(ok, false)
      assert.equal(batchUpdateCalled, false, 'an atomic bulk delete must never write when any id fails to resolve')
    })
  })

  describe('error mapping', () => {
    it('a 401 from the Sheets API surfaces as ConduitAuthError, not a generic failure', async () => {
      const mock = mockFetch(() => new Response('', { status: 401 }))
      restore = mock.restore

      const source = await connectSheet('bad-token')
      await assert.rejects(() => source.open().listRecords(), ConduitAuthError)
    })

    it('a non-401 non-2xx response surfaces as ConduitSourceError carrying the real HTTP status', async () => {
      const mock = mockFetch(() => new Response('', { status: 503 }))
      restore = mock.restore

      const source = await connectSheet()
      await assert.rejects(
        () => source.open().listRecords(),
        (error: unknown) => error instanceof ConduitSourceError && error.status === 503,
      )
    })

    it('includes Google\'s own error.message when the response body carries one, instead of just the bare status', async () => {
      const mock = mockFetch(() => jsonResponse({ error: { code: 400, message: 'Unable to parse range: A1:ZZ10000' } }, 400))
      restore = mock.restore

      const source = await connectSheet()
      await assert.rejects(
        () => source.open().listRecords(),
        (error: unknown) =>
          error instanceof ConduitSourceError &&
          error.status === 400 &&
          error.message.includes('Unable to parse range: A1:ZZ10000'),
      )
    })

    it('still surfaces a plain ConduitAuthError/ConduitSourceError, not a JSON-parsing error, for an empty or non-JSON error body', async () => {
      const emptyBody = mockFetch(() => new Response('', { status: 401 }))
      const client = createGoogleSheetsClient(sheetsOptions())
      await assert.rejects(() => client.connect('sheet-1', 'bad-token').then((s) => s.open().listRecords()), ConduitAuthError)
      emptyBody.restore()

      const htmlBody = mockFetch(() => new Response('<html>not json</html>', { status: 503, headers: { 'content-type': 'text/html' } }))
      restore = htmlBody.restore
      await assert.rejects(
        () => client.connect('sheet-1', 'good-token').then((s) => s.open().listRecords()),
        (error: unknown) => error instanceof ConduitSourceError && error.status === 503,
      )
    })
  })

  describe('metadata cache — TTL and credential partitioning', () => {
    it('caches listTables within the TTL — a second call for the same spreadsheet+credential makes no new request', async () => {
      let fetchCount = 0
      const mock = mockFetch(() => {
        fetchCount++
        return jsonResponse({ sheets: [{ properties: { title: 'Sheet1' } }] })
      })
      restore = mock.restore

      const client = createGoogleSheetsClient(sheetsOptions())
      const source = await client.connect('cache-test-1', 'same-token')
      await source.listTables()
      await source.listTables()
      assert.equal(fetchCount, 1, 'the second call within the TTL must be served from cache')
    })

    it('never shares the cache across two different credentials for the same spreadsheet', async () => {
      // Two owners with access to the same spreadsheet never share a
      // cached schema.
      let fetchCount = 0
      const mock = mockFetch(() => {
        fetchCount++
        return jsonResponse({ sheets: [{ properties: { title: 'Sheet1' } }] })
      })
      restore = mock.restore

      const client = createGoogleSheetsClient(sheetsOptions())
      const sourceA = await client.connect('cache-test-2', 'token-a')
      const sourceB = await client.connect('cache-test-2', 'token-b')
      await sourceA.listTables()
      await sourceB.listTables()
      assert.equal(fetchCount, 2, 'a different credential for the same spreadsheet must never hit the other one\'s cache entry')
    })

    it('invalidates the describeFields cache immediately when a field is created through it', async () => {
      let gridVersion: 'before' | 'after' = 'before'
      const mock = mockFetch((url, method) => {
        if (method === 'GET') {
          return gridVersion === 'before'
            ? jsonResponse({ values: [['conduit-id', 'name'], ['r1', 'Ada']] })
            : jsonResponse({ values: [['conduit-id', 'name', 'email'], ['r1', 'Ada', '']] })
        }
        if (url.endsWith('/values:batchUpdate')) {
          gridVersion = 'after'
          return jsonResponse({})
        }
        throw new Error(`unexpected call: ${method} ${url}`)
      })
      restore = mock.restore

      const client = createGoogleSheetsClient(sheetsOptions())
      const source = await client.connect('cache-test-3', 'good-token')
      const table = source.open()

      const before = await table.describeFields()
      assert.equal(before.some((f) => f.name === 'email'), false)

      await table.createField('email')

      const after = await table.describeFields()
      assert.equal(after.some((f) => f.name === 'email'), true, 'a field just created must be visible immediately, not stale for up to the cache TTL')
    })
  })

  describe('capabilities()', () => {
    it('reports every RACM method and bulkCreate: true — one atomic batched API call per bulk write', () => {
      const client = createGoogleSheetsClient(sheetsOptions())
      assert.deepEqual(client.capabilities(), { methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], bulkCreate: true })
    })
  })
})

describe('Sheets HTTP client — read cache and request budget', () => {
  let restore: (() => void) | undefined
  afterEach(() => {
    restore?.()
    restore = undefined
  })

  const grid = { values: [['conduit-id', 'name'], ['r1', 'Ada'], ['r2', 'Grace']] }

  it('reads the whole sheet, not a fixed number of rows', async () => {
    const mock = mockFetch(() => jsonResponse(grid))
    restore = mock.restore
    const source = await connectSheet()
    await source.open().listRecords()
    assert.match(mock.calls[0]!.url, /\/values\/A:ZZ\?/)
  })

  it('pages from one read while the cache lasts, and reads again after a write through the client', async () => {
    const mock = mockFetch((_url, method) => {
      if (method === 'GET') return jsonResponse(grid)
      return jsonResponse({ updates: { updatedRange: 'Sheet1!A4:B4' } })
    })
    restore = mock.restore
    const table = (await createGoogleSheetsClient({ ...sheetsOptions(), readCacheMs: 60_000 }).connect('sheet-1', 'good-token')).open()

    const first = await table.listRecords({ limit: 1 })
    await table.listRecords({ cursor: first.nextCursor!, limit: 1 })
    assert.equal(mock.calls.filter((c) => c.method === 'GET').length, 1, 'the second page came from the cache')

    await table.createRecord({ name: 'Mary' }).catch(() => {})
    const readsBefore = mock.calls.filter((c) => c.method === 'GET').length
    await table.listRecords()
    assert.equal(mock.calls.filter((c) => c.method === 'GET').length, readsBefore + 1, 'a write clears the cache')
  })

  it('never serves one access token the rows read with another', async () => {
    const mock = mockFetch(() => jsonResponse(grid))
    restore = mock.restore
    const client = createGoogleSheetsClient({ ...sheetsOptions(), readCacheMs: 60_000 })
    await (await client.connect('sheet-1', 'token-a')).open().listRecords()
    await (await client.connect('sheet-1', 'token-b')).open().listRecords()
    assert.equal(mock.calls.length, 2)
  })

  it('refuses with a retry time once the per-account budget is used, without calling Google', async () => {
    const mock = mockFetch(() => jsonResponse(grid))
    restore = mock.restore
    const client = createGoogleSheetsClient({ ...sheetsOptions(), readCacheMs: 1, budget: { perMinute: 100, perCredentialPerMinute: 2 } })
    const table = (await client.connect('sheet-1', 'good-token')).open()
    await table.listRecords()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await table.listRecords()
    await new Promise((resolve) => setTimeout(resolve, 5))
    await assert.rejects(table.listRecords(), (err: unknown) => err instanceof ConduitRateLimitError && err.retryAfterSeconds >= 1)
    assert.equal(mock.calls.length, 2)
    // Another account still has its own budget.
    await (await client.connect('sheet-1', 'other-token')).open().listRecords()
  })

  it("turns Google's own 429 into a rate-limit error", async () => {
    const mock = mockFetch(() => jsonResponse({ error: { message: 'Quota exceeded' } }, 429))
    restore = mock.restore
    const table = (await connectSheet()).open()
    await assert.rejects(table.listRecords(), (err: unknown) => err instanceof ConduitRateLimitError && /Quota exceeded/.test(err.message))
  })
})
