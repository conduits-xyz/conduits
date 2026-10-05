import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createGoogleSheet } from '../sheets-create.ts'

const SHEETS_API = 'https://sheets.example/v4/spreadsheets'

// The Sheets API answering with `handler`.
function api(handler: (init: RequestInit | undefined) => Response) {
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    assert.equal(String(input), SHEETS_API)
    return handler(init)
  }) as typeof fetch
  return { apiUrl: SHEETS_API, fetch: fetchImpl }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

describe('createGoogleSheet', () => {
  it('POSTs {properties: {title}} with the given access token, returning the real id/url Google hands back', async () => {
    let capturedInit: RequestInit | undefined
    const sheets = api((init) => {
      capturedInit = init
      return jsonResponse({ spreadsheetId: 'sheet-123', spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/sheet-123/edit' })
    })

    const result = await createGoogleSheet(sheets, 'good-token', 'My Signups')

    assert.equal(result.spreadsheetId, 'sheet-123')
    assert.equal(result.url, 'https://docs.google.com/spreadsheets/d/sheet-123/edit')
    assert.equal((capturedInit?.headers as Record<string, string>)?.Authorization, 'Bearer good-token')
    assert.deepEqual(JSON.parse(String(capturedInit?.body)), { properties: { title: 'My Signups' } })
  })

  it('builds the docs.google.com edit url itself when spreadsheetUrl is absent from the response', async () => {
    const sheets = api(() => jsonResponse({ spreadsheetId: 'sheet-456' }))
    const result = await createGoogleSheet(sheets, 'good-token', 'My Signups')
    assert.equal(result.url, 'https://docs.google.com/spreadsheets/d/sheet-456/edit')
  })

  it('a non-2xx response surfaces Google\'s own error.message, not just the bare status', async () => {
    const sheets = api(() => jsonResponse({ error: { message: 'Request had insufficient authentication scopes.' } }, 403))
    await assert.rejects(
      () => createGoogleSheet(sheets, 'good-token', 'My Signups'),
      (error: unknown) => error instanceof Error && error.message.includes('Request had insufficient authentication scopes.'),
    )
  })

  it('a non-2xx response with no JSON body still fails with the bare status, not a crash', async () => {
    const sheets = api(() => new Response('', { status: 401 }))
    await assert.rejects(() => createGoogleSheet(sheets, 'bad-token', 'My Signups'), /401/)
  })

  it('a 2xx response missing spreadsheetId is a real failure, not a silent success with an undefined id', async () => {
    const sheets = api(() => jsonResponse({}))
    await assert.rejects(() => createGoogleSheet(sheets, 'good-token', 'My Signups'), /did not return a spreadsheetId/)
  })
})
