import * as assert from 'remix/assert'
import { describe, it, afterEach } from 'remix/test'

import { createGmailApiClient } from '../gmail.ts'
import { ConduitAuthError, ConduitSourceError } from '../sheets.ts'
import { jsonResponse } from './helpers.ts'

// createGmailApiClient() always hits the real Gmail API — same reasoning
// as fastmail.ts's own createJmapFastmailClient() test file. NODE_ENV=test
// always resolves the exported gmailClient to the Mailpit-backed
// implementation instead (see services/gateway/test/gateway.test.ts for
// this repo's own server-level test against real Mailpit, for
// fastmail) — this file is what actually exercises the Gmail REST
// API's own request/response shape.

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

function mockFetch(handler: (init: RequestInit | undefined) => Response): () => void {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url === SEND_URL) return handler(init)
    return original(input, init)
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}


function decodeRaw(init: RequestInit | undefined): string {
  const body = JSON.parse(String(init?.body)) as { raw: string }
  return Buffer.from(body.raw, 'base64url').toString('utf8')
}

describe('Gmail API client (mocked fetch — real request/response shapes)', () => {
  let restore: (() => void) | undefined
  afterEach(() => {
    restore?.()
    restore = undefined
  })

  it('a rejected send (401) surfaces as ConduitAuthError, not a generic failure', async () => {
    restore = mockFetch(() => new Response('', { status: 401 }))
    const client = createGmailApiClient()
    const source = await client.connect('', 'bad-token')
    const table = source.open(JSON.stringify({ recipients: ['owner@example.com'], subject: 'Contact form' }))
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), ConduitAuthError)
  })

  it('a non-2xx response surfaces as ConduitSourceError, carrying Gmail\'s own error message', async () => {
    restore = mockFetch(() => jsonResponse({ error: { message: 'quota exceeded' } }, 429))
    const client = createGmailApiClient()
    const source = await client.connect('', 'good-token')
    const table = source.open(JSON.stringify({ recipients: ['owner@example.com'], subject: 'Contact form' }))
    // Gmail's own error body (message) is real diagnostic information —
    // packages/gateway/middleware/source-errors.ts logs only this error's own
    // `.message`, so a bare status code alone isn't enough to debug a
    // real failure from the server log.
    await assert.rejects(
      () => table.createRecord({ name: 'Ada' }),
      (error: unknown) => error instanceof ConduitSourceError && error.message.includes('quota exceeded'),
    )
  })

  it('a 2xx response with no message id is a real failure, not a silent partial success', async () => {
    restore = mockFetch(() => jsonResponse({}))
    const client = createGmailApiClient()
    const source = await client.connect('', 'good-token')
    const table = source.open(JSON.stringify({ recipients: ['owner@example.com'], subject: 'Contact form' }))
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), ConduitSourceError)
  })

  it('sends a base64url-encoded raw message built from the configured recipients/subject, never fields from the submission', async () => {
    let capturedInit: RequestInit | undefined
    restore = mockFetch((init) => {
      capturedInit = init
      return jsonResponse({ id: 'msg-1' })
    })

    const client = createGmailApiClient()
    const source = await client.connect('', 'good-token')
    const table = source.open(JSON.stringify({ recipients: ['owner@example.com', 'teammate@example.com'], subject: 'Contact form' }))
    const record = await table.createRecord({ name: 'Ada', email: 'ada@example.com' })

    assert.equal(record.id, 'msg-1')
    assert.equal((capturedInit?.headers as Record<string, string>)?.Authorization, 'Bearer good-token')
    const decoded = decodeRaw(capturedInit)
    assert.match(decoded, /^To: owner@example\.com, teammate@example\.com\r\n/)
    assert.match(decoded, /Subject: Contact form\r\n/)
    assert.match(decoded, /name: Ada/)
    assert.match(decoded, /email: ada@example\.com/)
  })

  it('a conduit with no recipients/subject configured refuses to send', async () => {
    restore = mockFetch(() => jsonResponse({ id: 'msg-1' }))
    const client = createGmailApiClient()
    const source = await client.connect('', 'good-token')
    const table = source.open(JSON.stringify({}))
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), ConduitSourceError)
  })

  it('listRecords/deleteRecord refuse cleanly — not supported, and never reachable via RACM regardless', async () => {
    const client = createGmailApiClient()
    const source = await client.connect('', 'good-token')
    const table = source.open(JSON.stringify({ recipients: ['owner@example.com'], subject: 'Contact form' }))
    await assert.rejects(() => table.listRecords(), ConduitSourceError)
    await assert.rejects(() => table.deleteRecord('msg-1'), ConduitSourceError)
  })

  it('capabilities() only ever offers POST, and never allows bulk create', () => {
    const client = createGmailApiClient()
    assert.deepEqual(client.capabilities(), { methods: ['POST'], bulkCreate: false })
  })
})
