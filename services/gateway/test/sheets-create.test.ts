import * as assert from 'remix/assert'
import { describe, it, afterEach } from 'remix/test'

import { createGoogleSheet } from '../sheets-create.ts'

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

function mockFetch(handler: (init: RequestInit | undefined) => Response): () => void {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === SHEETS_API) return handler(init)
    throw new Error(`unexpected fetch in sheets-create.test.ts: ${url}`)
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('createGoogleSheet', () => {
  let restore: (() => void) | undefined
  afterEach(() => {
    restore?.()
    restore = undefined
  })

  it('POSTs {properties: {title}} with the given access token, returning the real id/url Google hands back', async () => {
    let capturedInit: RequestInit | undefined
    restore = mockFetch((init) => {
      capturedInit = init
      return jsonResponse({ spreadsheetId: 'sheet-123', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-123/edit' })
    })

    const result = await createGoogleSheet('good-token', 'My Signups')

    assert.equal(result.spreadsheetId, 'sheet-123')
    assert.equal(result.url, 'https://docs.google.com/spreadsheets/d/sheet-123/edit')
    assert.equal((capturedInit?.headers as Record<string, string>)?.Authorization, 'Bearer good-token')
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), { properties: { title: 'My Signups' } })
  })

  it('builds the docs.google.com edit url itself when spreadsheetUrl is absent from the response', async () => {
    restore = mockFetch(() => jsonResponse({ spreadsheetId: 'sheet-456' }))
    const result = await createGoogleSheet('good-token', 'My Signups')
    assert.equal(result.url, 'https://docs.google.com/spreadsheets/d/sheet-456/edit')
  })

  it('a non-2xx response surfaces Google\'s own error.message, not just the bare status', async () => {
    restore = mockFetch(() => jsonResponse({ error: { message: 'Request had insufficient authentication scopes.' } }, 403))
    await assert.rejects(
      () => createGoogleSheet('good-token', 'My Signups'),
      (error: unknown) => error instanceof Error && error.message.includes('Request had insufficient authentication scopes.'),
    )
  })

  it('a non-2xx response with no JSON body still fails with the bare status, not a crash', async () => {
    restore = mockFetch(() => new Response('', { status: 401 }))
    await assert.rejects(() => createGoogleSheet('bad-token', 'My Signups'), /401/)
  })

  it('a 2xx response missing spreadsheetId is a real failure, not a silent success with an undefined id', async () => {
    restore = mockFetch(() => jsonResponse({}))
    await assert.rejects(() => createGoogleSheet('good-token', 'My Signups'), /did not return a spreadsheetId/)
  })
})
