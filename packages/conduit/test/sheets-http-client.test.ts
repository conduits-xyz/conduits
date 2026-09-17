import * as assert from 'remix/assert'
import { describe, it, afterEach } from 'remix/test'

import { createHttpSheetsClient, ConduitAuthError, ConduitSourceError, ConduitUnknownFieldError } from '../sheets.ts'
import { jsonResponse } from './helpers.ts'

// createHttpSheetsClient() always hits the real Sheets API —
// NODE_ENV=test always resolves the exported googleSheetsClient to the
// in-memory fake instead (see sheets-field-types.test.ts/
// sheets-id-column.test.ts for that client's own pure-function tests).
// This file is what actually exercises the real client's request
// building, error mapping, and metadata cache. Same "mocked fetch,
// real request/response shapes" style as gmail.test.ts/fastmail.test.ts.

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

type Call = { url: string; method: string; body: unknown; authorization: string | undefined }

// Fails loudly on any unmatched call rather than falling through to a
// real fetch — every request this client makes targets sheets.googleapis.com,
// so an unmatched call means a test's route table is missing something,
// not a legitimate pass-through.
function mockFetch(handler: (url: string, method: string, body: unknown) => Response): { calls: Call[]; restore: () => void } {
  const original = globalThis.fetch
  const calls: Call[] = []
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const authorization = (init?.headers as Record<string, string> | undefined)?.Authorization
    calls.push({ url, method, body, authorization })
    return handler(url, method, body)
  }) as typeof fetch
  return {
    calls,
    restore: () => {
      globalThis.fetch = original
    },
  }
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
        assert.equal(url, `${SHEETS_API}/sheet-1/values/A1:ZZ10000`)
        return jsonResponse({ values: [['conduit-id', 'name'], ['r1', 'Ada']] })
      })
      restore = mock.restore

      const client = createHttpSheetsClient()
      const source = await client.connect('sheet-1', 'good-token')
      const { records } = await source.open().listRecords()

      assert.equal(records.length, 1)
      assert.equal(mock.calls[0]?.method, 'GET')
      assert.equal(mock.calls[0]?.authorization, 'Bearer good-token')
    })

    it('quotes a table name in the range, doubling any embedded single quotes', async () => {
      const mock = mockFetch((url) => {
        assert.equal(url, `${SHEETS_API}/sheet-1/values/'Q&A''s'!A1:ZZ10000`)
        return jsonResponse({ values: [] })
      })
      restore = mock.restore

      const client = createHttpSheetsClient()
      const source = await client.connect('sheet-1', 'good-token')
      await source.open(JSON.stringify({ table: "Q&A's" })).listRecords()
    })

    it('listTables reads sheet titles via the fields-filtered spreadsheet-metadata endpoint', async () => {
      const mock = mockFetch((url) => {
        assert.equal(url, `${SHEETS_API}/sheet-1?fields=sheets.properties.title`)
        return jsonResponse({ sheets: [{ properties: { title: 'Sheet1' } }, { properties: { title: 'Archive' } }] })
      })
      restore = mock.restore

      const client = createHttpSheetsClient()
      const source = await client.connect('sheet-1', 'good-token')
      const tables = await source.listTables()
      assert.deepEqual(tables, ['Sheet1', 'Archive'])
    })
  })

  describe('request building — writes', () => {
    it('bootstraps a missing id column before appending, backfilling every existing row with a generated id', async () => {
      const mock = mockFetch((url, method, body) => {
        if (method === 'GET') {
          // Header already has a real field column, but no conduit-id
          // column yet, plus one pre-existing data row — the realistic
          // "first write to an already-typed sheet" bootstrap case.
          // createRecord() only ever reads the grid once per call, so
          // there's no second GET here to disambiguate.
          return jsonResponse({ values: [['name'], ['Old Row']] })
        }
        if (url.endsWith('/values:batchUpdate')) {
          const data = (body as { data: Array<{ range: string; values: string[][] }> }).data
          // One header cell for the new column, plus a backfill cell for
          // the one existing data row — both in the new column (B).
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
          // header order is [name, conduit-id] — the new column is
          // always appended after existing ones, never inserted.
          assert.equal(values.length, 1)
          assert.equal(values[0]?.[0], 'Ada')
          assert.equal(typeof values[0]?.[1], 'string')
          assert.ok((values[0]?.[1] as string).length > 0, 'the new row gets a real, non-empty id in the conduit-id column')
          return jsonResponse({})
        }
        throw new Error(`unexpected call: ${method} ${url}`)
      })
      restore = mock.restore

      const client = createHttpSheetsClient()
      const source = await client.connect('sheet-1', 'good-token')
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

      const client = createHttpSheetsClient()
      const source = await client.connect('sheet-1', 'good-token')
      await assert.rejects(() => source.open().createRecord({ unknownField: 'x' }), ConduitUnknownFieldError)
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
          // r1/r2/r3 resolve to rows 1/2/3 (row 0 is the header) — each
          // delete shifts rows below it up by one, so applying highest-
          // index-first keeps every later request's index valid.
          assert.deepEqual(indexes, [3, 2, 1])
          return jsonResponse({})
        }
        throw new Error(`unexpected call: ${method} ${url}`)
      })
      restore = mock.restore

      const client = createHttpSheetsClient()
      const source = await client.connect('sheet-1', 'good-token')
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

      const client = createHttpSheetsClient()
      const source = await client.connect('sheet-1', 'good-token')
      const ok = await source.open().deleteRecords(['r1', 'r2'])
      assert.equal(ok, false)
      assert.equal(batchUpdateCalled, false, 'an atomic bulk delete must never write when any id fails to resolve')
    })
  })

  describe('error mapping', () => {
    it('a 401 from the Sheets API surfaces as ConduitAuthError, not a generic failure', async () => {
      const mock = mockFetch(() => new Response('', { status: 401 }))
      restore = mock.restore

      const client = createHttpSheetsClient()
      const source = await client.connect('sheet-1', 'bad-token')
      await assert.rejects(() => source.open().listRecords(), ConduitAuthError)
    })

    it('a non-401 non-2xx response surfaces as ConduitSourceError carrying the real HTTP status', async () => {
      const mock = mockFetch(() => new Response('', { status: 503 }))
      restore = mock.restore

      const client = createHttpSheetsClient()
      const source = await client.connect('sheet-1', 'good-token')
      await assert.rejects(
        () => source.open().listRecords(),
        (error: unknown) => error instanceof ConduitSourceError && error.status === 503,
      )
    })

    it('includes Google\'s own error.message when the response body carries one, instead of just the bare status', async () => {
      const mock = mockFetch(() => jsonResponse({ error: { code: 400, message: 'Unable to parse range: A1:ZZ10000' } }, 400))
      restore = mock.restore

      const client = createHttpSheetsClient()
      const source = await client.connect('sheet-1', 'good-token')
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
      const client = createHttpSheetsClient()
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

      const client = createHttpSheetsClient()
      const source = await client.connect('cache-test-1', 'same-token')
      await source.listTables()
      await source.listTables()
      assert.equal(fetchCount, 1, 'the second call within the TTL must be served from cache')
    })

    it('never shares the cache across two different credentials for the same spreadsheet', async () => {
      // The security property this guards: two different owners who
      // both happen to have access to the same underlying spreadsheet
      // must never have one's schema list served from a cache entry
      // the other's token populated.
      let fetchCount = 0
      const mock = mockFetch(() => {
        fetchCount++
        return jsonResponse({ sheets: [{ properties: { title: 'Sheet1' } }] })
      })
      restore = mock.restore

      const client = createHttpSheetsClient()
      const sourceA = await client.connect('cache-test-2', 'token-a')
      const sourceB = await client.connect('cache-test-2', 'token-b')
      await sourceA.listTables()
      await sourceB.listTables()
      assert.equal(fetchCount, 2, 'a different credential for the same spreadsheet must never hit the other one\'s cache entry')
    })

    it('invalidates the describeFields cache immediately when a field is created through it', async () => {
      let gridVersion: 'before' | 'after' = 'before'
      const mock = mockFetch((url, method, body) => {
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

      const client = createHttpSheetsClient()
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
      const client = createHttpSheetsClient()
      assert.deepEqual(client.capabilities(), { methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], bulkCreate: true })
    })
  })
})
