import * as assert from 'remix/assert'
import { describe, it, afterEach } from 'remix/test'

import { createGmailClient } from '../gmail.ts'
import { ConduitAuthError, ConduitRateLimitError, ConduitSourceError } from '../sheets.ts'

// The endpoint, with a fetch that calls whatever global fetch the
// test's mock has installed.
const GMAIL = { apiUrl: 'https://gmail.googleapis.com/gmail/v1', fetch: ((input, init) => globalThis.fetch(input, init)) as typeof fetch, now: () => Date.parse('2026-10-05T12:00:00.000Z'), makeId: () => 'id' }
import { jsonResponse } from './helpers.ts'

// The Gmail API client with a mocked fetch.

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
    const client = createGmailClient(GMAIL)
    const source = await client.connect('', 'bad-token')
    const table = source.open(JSON.stringify({ recipients: ['owner@example.com'], subject: 'Contact form' }))
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), ConduitAuthError)
  })

  it('a rate limit surfaces as ConduitRateLimitError, carrying Gmail\'s own error message', async () => {
    restore = mockFetch(() => jsonResponse({ error: { message: 'quota exceeded' } }, 429))
    const client = createGmailClient(GMAIL)
    const source = await client.connect('', 'good-token')
    const table = source.open(JSON.stringify({ recipients: ['owner@example.com'], subject: 'Contact form' }))
    // Gmail's error message is kept, since source-errors.ts logs only
    // the error's message.
    await assert.rejects(
      () => table.createRecord({ name: 'Ada' }),
      (error: unknown) => error instanceof ConduitRateLimitError && error.retryAfterSeconds === 30 && error.message.includes('quota exceeded'),
    )
  })

  it('a 2xx response with no message id is a real failure, not a silent partial success', async () => {
    restore = mockFetch(() => jsonResponse({}))
    const client = createGmailClient(GMAIL)
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

    const client = createGmailClient(GMAIL)
    const source = await client.connect('', 'good-token')
    const table = source.open(JSON.stringify({ recipients: ['owner@example.com', 'teammate@example.com'], subject: 'Contact form' }))
    const record = await table.createRecord({ name: 'Ada', email: 'ada@example.com' })

    assert.equal(record.id, 'msg-1')
    assert.equal((capturedInit?.headers as Record<string, string>)?.authorization, 'Bearer good-token')
    const decoded = decodeRaw(capturedInit)
    assert.match(decoded, /^To: owner@example\.com, teammate@example\.com\r\n/)
    assert.match(decoded, /Subject: Contact form\r\n/)
    const body = Buffer.from(decoded.split('\r\n\r\n')[1]!, 'base64').toString('utf8')
    assert.equal(body, 'name: Ada\nemail: ada@example.com')
  })

  it('a conduit with no recipients/subject configured refuses to send', async () => {
    restore = mockFetch(() => jsonResponse({ id: 'msg-1' }))
    const client = createGmailClient(GMAIL)
    const source = await client.connect('', 'good-token')
    const table = source.open(JSON.stringify({}))
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), ConduitSourceError)
  })

  it('listRecords/deleteRecord refuse cleanly — not supported, and never reachable via RACM regardless', async () => {
    const client = createGmailClient(GMAIL)
    const source = await client.connect('', 'good-token')
    const table = source.open(JSON.stringify({ recipients: ['owner@example.com'], subject: 'Contact form' }))
    await assert.rejects(() => table.listRecords(), ConduitSourceError)
    await assert.rejects(() => table.deleteRecord('msg-1'), ConduitSourceError)
  })

  it('capabilities() only ever offers POST, and never allows bulk create', () => {
    const client = createGmailClient(GMAIL)
    assert.deepEqual(client.capabilities(), { methods: ['POST'], bulkCreate: false })
  })
})
