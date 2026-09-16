import * as assert from 'remix/assert'
import { describe, it, afterEach } from 'remix/test'

import { createJmapFastmailClient, listJmapIdentities } from '../fastmail.ts'
import { ConduitAuthError, ConduitSourceError } from '../sheets.ts'
import { jsonResponse } from './helpers.ts'

// createJmapFastmailClient() always hits real Fastmail servers — like
// sheets.ts's own getSheetId(), any caller that needs to exercise this
// directly has to scope a real fetch mock around it for the same
// reason. NODE_ENV=test always resolves the exported fastmailClient to
// the Mailpit-backed implementation instead — this file is what
// actually exercises the JMAP request/response shapes themselves.

const API_URL = 'https://api.fastmail.example/jmap/api/'
const ACCOUNT_ID = 'u1'

function mockFetch(handlers: {
  session?: () => Response
  jmap?: (method: string, body: unknown) => Response
}): () => void {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.endsWith('/jmap/session')) {
      return handlers.session?.() ?? new Response('not mocked', { status: 500 })
    }
    if (url === API_URL) {
      const parsed = JSON.parse(String(init?.body)) as { methodCalls: Array<[string, unknown, string]> }
      const [method] = parsed.methodCalls[0]!
      return handlers.jmap?.(method, parsed) ?? new Response('not mocked', { status: 500 })
    }
    return original(input, init)
  }) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

describe('Fastmail JMAP client (mocked fetch — real request/response shapes)', () => {
  let restore: (() => void) | undefined
  afterEach(() => {
    restore?.()
    restore = undefined
  })

  it('a rejected session fetch (401) surfaces as ConduitAuthError, not a generic failure', async () => {
    restore = mockFetch({ session: () => new Response('', { status: 401 }) })
    const client = createJmapFastmailClient()
    await assert.rejects(() => client.connect('ident-1', 'bad-token'), ConduitAuthError)
  })

  it('a JMAP-level error response surfaces as ConduitSourceError', async () => {
    restore = mockFetch({
      session: () =>
        jsonResponse({ apiUrl: API_URL, primaryAccounts: { 'urn:ietf:params:jmap:mail': ACCOUNT_ID } }),
      // Any call listTables() triggers (Mailbox/get) fails at the
      // protocol level, not the HTTP level — connect() itself no
      // longer calls Identity/get (see fetchSession's own comment: the
      // identity comes from sourceKey, chosen at connect time,
      // never re-derived here).
      jmap: () => jsonResponse({ methodResponses: [['error', { type: 'accountNotFound' }, '0']] }),
    })
    const client = createJmapFastmailClient()
    const source = await client.connect('ident-1', 'good-token')
    await assert.rejects(() => source.listTables(), ConduitSourceError)
  })

  it('sends a message via Email/set + EmailSubmission/set with the configured recipients/subject, and the identity connect() was given — never a re-derived or guessed one', async () => {
    let capturedSend: { methodCalls: Array<[string, Record<string, unknown>, string]> } | undefined
    restore = mockFetch({
      session: () =>
        jsonResponse({ apiUrl: API_URL, primaryAccounts: { 'urn:ietf:params:jmap:mail': ACCOUNT_ID } }),
      jmap: (method, body) => {
        if (method === 'Mailbox/get') {
          return jsonResponse({
            methodResponses: [
              ['Mailbox/get', { list: [{ id: 'drafts-1', name: 'Drafts', role: 'drafts' }] }, '0'],
            ],
          })
        }
        if (method === 'Email/set') {
          capturedSend = body as typeof capturedSend
          return jsonResponse({
            methodResponses: [
              ['Email/set', { created: { draft: { id: 'email-1' } } }, '0'],
              ['EmailSubmission/set', { created: { sendIt: { id: 'sub-1' } } }, '1'],
            ],
          })
        }
        return jsonResponse({ methodResponses: [['error', { type: 'unknownMethod' }, '0']] })
      },
    })

    const client = createJmapFastmailClient()
    // 'ident-2' — deliberately not the account's only/first identity in
    // spirit, to prove this is threaded straight through from connect(),
    // not silently picked some other way.
    const source = await client.connect('ident-2', 'good-token')
    const table = source.open(JSON.stringify({ recipients: ['owner@example.com'], subject: 'Contact form' }))
    const record = await table.createRecord({ name: 'Ada', email: 'ada@example.com' })

    assert.equal(record.id, 'email-1')
    assert.ok(capturedSend, 'expected Email/set to have been called')
    const [, emailSetArgs] = capturedSend!.methodCalls[0]!
    const draft = (emailSetArgs as { create: { draft: { to: Array<{ email: string }>; subject: string } } }).create.draft
    assert.deepEqual(draft.to.map((r) => r.email), ['owner@example.com'])
    assert.equal(draft.subject, 'Contact form')

    const [, submissionArgs] = capturedSend!.methodCalls[1]!
    assert.equal(
      (submissionArgs as { create: { sendIt: { identityId: string } } }).create.sendIt.identityId,
      'ident-2',
    )
  })

  it('a draft created but never submitted is a real failure, not a silent partial success', async () => {
    restore = mockFetch({
      session: () =>
        jsonResponse({ apiUrl: API_URL, primaryAccounts: { 'urn:ietf:params:jmap:mail': ACCOUNT_ID } }),
      jmap: (method) => {
        if (method === 'Mailbox/get') {
          return jsonResponse({
            methodResponses: [
              ['Mailbox/get', { list: [{ id: 'drafts-1', name: 'Drafts', role: 'drafts' }] }, '0'],
            ],
          })
        }
        if (method === 'Email/set') {
          return jsonResponse({
            methodResponses: [
              ['Email/set', { created: { draft: { id: 'email-1' } } }, '0'],
              // Submission simply didn't create anything — the
              // exact partial-failure shape the investigation doc
              // flags: created but never sent.
              ['EmailSubmission/set', { created: {} }, '1'],
            ],
          })
        }
        return jsonResponse({ methodResponses: [['error', { type: 'unknownMethod' }, '0']] })
      },
    })

    const client = createJmapFastmailClient()
    const source = await client.connect('ident-1', 'good-token')
    const table = source.open(JSON.stringify({ recipients: ['owner@example.com'], subject: 'Contact form' }))
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), ConduitSourceError)
  })

  it("connect()'s own account has no sending identity — requireSendable() fails clearly instead of guessing one", async () => {
    restore = mockFetch({
      session: () =>
        jsonResponse({ apiUrl: API_URL, primaryAccounts: { 'urn:ietf:params:jmap:mail': ACCOUNT_ID } }),
    })
    const client = createJmapFastmailClient()
    // No identity chosen (empty sourceKey) — e.g. a conduit connected
    // before this account had any sending identity at all.
    const source = await client.connect('', 'good-token')
    const table = source.open(JSON.stringify({ recipients: ['owner@example.com'], subject: 'Contact form' }))
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), ConduitSourceError)
  })

  it('listJmapIdentities returns every identity on the account, for a "Send as" picker', async () => {
    restore = mockFetch({
      session: () =>
        jsonResponse({ apiUrl: API_URL, primaryAccounts: { 'urn:ietf:params:jmap:mail': ACCOUNT_ID } }),
      jmap: (method) => {
        if (method === 'Identity/get') {
          return jsonResponse({
            methodResponses: [
              [
                'Identity/get',
                {
                  list: [
                    { id: 'ident-1', email: 'you@fastmail.com', name: 'Ada' },
                    { id: 'ident-2', email: 'sales@yourdomain.com', name: null },
                  ],
                },
                '0',
              ],
            ],
          })
        }
        return jsonResponse({ methodResponses: [['error', { type: 'unknownMethod' }, '0']] })
      },
    })
    const identities = await listJmapIdentities('good-token')
    assert.deepEqual(identities, [
      { id: 'ident-1', email: 'you@fastmail.com', name: 'Ada' },
      { id: 'ident-2', email: 'sales@yourdomain.com', name: null },
    ])
  })
})
