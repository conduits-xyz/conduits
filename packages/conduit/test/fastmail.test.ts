import * as assert from 'remix/assert'
import { describe, it, afterEach } from 'remix/test'

import { createFastmailClient, listFastmailIdentities } from '../fastmail.ts'
import { ConduitAuthError, ConduitRateLimitError, ConduitSourceError } from '../sheets.ts'

// The endpoint, with a fetch that calls whatever global fetch the
// test's mock has installed.
const FASTMAIL = { sessionUrl: 'https://api.fastmail.com/jmap/session', fetch: ((input, init) => globalThis.fetch(input, init)) as typeof fetch, now: () => Date.parse('2026-10-05T12:00:00.000Z'), makeId: () => 'id' }
import { jsonResponse, replaceFetch } from './helpers.ts'

// The JMAP client with a mocked fetch.

const API_URL = 'https://api.fastmail.example/jmap/api/'
const ACCOUNT_ID = 'u1'

// Every URL the mock was asked for, in order.
let fetched: string[] = []

function mockFetch(handlers: {
  session?: () => Response
  jmap?: (method: string, body: unknown) => Response
}): () => void {
  fetched = []
  return replaceFetch((url, init) => {
    fetched.push(url)
    if (url.endsWith('/jmap/session')) {
      return handlers.session?.() ?? new Response('not mocked', { status: 500 })
    }
    if (url === API_URL) {
      const parsed = JSON.parse(String(init?.body)) as { methodCalls: Array<[string, unknown, string]> }
      const [method] = parsed.methodCalls[0]!
      return handlers.jmap?.(method, parsed) ?? new Response('not mocked', { status: 500 })
    }
    return new Response('not mocked', { status: 500 })
  })
}

describe('Fastmail JMAP client (mocked fetch — real request/response shapes)', () => {
  let restore: (() => void) | undefined
  afterEach(() => {
    restore?.()
    restore = undefined
  })

  it('a rejected session fetch (401) surfaces as ConduitAuthError, not a generic failure', async () => {
    restore = mockFetch({ session: () => new Response('', { status: 401 }) })
    const client = createFastmailClient(FASTMAIL)
    await assert.rejects(() => client.connect('ident-1', 'bad-token'), ConduitAuthError)
  })

  it('a JMAP-level error in the account lookup surfaces from connect() as ConduitSourceError', async () => {
    restore = mockFetch({
      session: () =>
        jsonResponse({ apiUrl: API_URL, primaryAccounts: { 'urn:ietf:params:jmap:mail': ACCOUNT_ID } }),
      // The lookup fails at the JMAP level, not HTTP.
      jmap: () => jsonResponse({ methodResponses: [['error', { type: 'accountNotFound' }, 'identities'], ['error', { type: 'accountNotFound' }, 'mailboxes']] }),
    })
    const client = createFastmailClient(FASTMAIL)
    await assert.rejects(() => client.connect('ident-1', 'good-token'), (error: unknown) => error instanceof ConduitSourceError && /accountNotFound/.test(error.message))
  })

  // The JMAP server for a send through @m5nv/mail's transport: the
  // lookup, then the send, answered by `onSend`.
  function sendServer(onSend: (body: { methodCalls: Array<[string, Record<string, unknown>, string]> }) => Response) {
    return mockFetch({
      session: () => jsonResponse({ apiUrl: API_URL, primaryAccounts: { 'urn:ietf:params:jmap:mail': ACCOUNT_ID } }),
      jmap: (method, body) => {
        if (method === 'Identity/get') {
          return jsonResponse({
            methodResponses: [
              ['Identity/get', { list: [{ id: 'ident-1', email: 'you@fastmail.com', name: 'Ada' }, { id: 'ident-2', email: 'sales@yourdomain.com', name: '' }] }, 'identities'],
              ['Mailbox/get', { list: [{ id: 'drafts-1', role: 'drafts' }] }, 'mailboxes'],
            ],
          })
        }
        if (method === 'Email/set') return onSend(body as Parameters<typeof onSend>[0])
        return jsonResponse({ methodResponses: [['error', { type: 'unknownMethod' }, '0']] })
      },
    })
  }

  // The contact form's table, sending as `identityId`.
  async function contactForm(identityId: string) {
    const source = await createFastmailClient(FASTMAIL).connect(identityId, 'good-token')
    return source.open(JSON.stringify({ recipients: ['owner@example.com'], subject: 'Contact form' }))
  }

  // Fastmail's answer to a send whose draft is created and whose
  // submission is refused for `type`.
  const submissionRefused = (type: string) => () =>
    jsonResponse({
      methodResponses: [
        ['Email/set', { created: { draft: { id: 'email-1' } } }, 'draft'],
        ['EmailSubmission/set', { notCreated: { send: { type } } }, 'send'],
      ],
    })

  it('sends the configured recipients and subject, with the submitted fields as the body, as the identity connect() was given', async () => {
    let captured: { methodCalls: Array<[string, Record<string, unknown>, string]> } | undefined
    restore = sendServer((body) => {
      captured = body
      return jsonResponse({
        methodResponses: [
          ['Email/set', { created: { draft: { id: 'email-1' } } }, 'draft'],
          ['EmailSubmission/set', { created: { send: { id: 'sub-1' } } }, 'send'],
        ],
      })
    })

    // 'ident-2', not the first identity, to show the one from connect()
    // is used.
    const table = await contactForm('ident-2')
    const record = await table.createRecord({ name: 'Ada', email: 'ada@example.com' })

    assert.equal(record.id, 'email-1')
    // The session and the account lookup at connect(), then the send.
    assert.equal(fetched.length, 3)
    const draft = (captured!.methodCalls[0]![1] as { create: { draft: { from: { email: string }[]; to: { email: string }[]; subject: string; bodyValues: { text: { value: string } } } } }).create.draft
    assert.deepEqual(draft.from, [{ email: 'sales@yourdomain.com' }])
    assert.deepEqual(draft.to, [{ email: 'owner@example.com' }])
    assert.equal(draft.subject, 'Contact form')
    assert.equal(draft.bodyValues.text.value, 'name: Ada\nemail: ada@example.com')
    assert.equal((captured!.methodCalls[1]![1] as { create: { send: { identityId: string } } }).create.send.identityId, 'ident-2')
  })

  it('a draft created but never submitted fails with a 502, after removing the draft', async () => {
    restore = sendServer(submissionRefused('invalidRecipients'))
    const table = await contactForm('ident-1')
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), (error: unknown) => error instanceof ConduitSourceError && error.status === 502)
  })

  it('a send Fastmail refuses for a sending limit is busy, with a Retry-After', async () => {
    restore = sendServer(submissionRefused('forbiddenToSend'))
    const table = await contactForm('ident-1')
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), (error: unknown) => error instanceof ConduitRateLimitError && error.retryAfterSeconds === 30)
  })

  it('an identity no longer on the account fails clearly', async () => {
    restore = sendServer(() => jsonResponse({}))
    const table = await contactForm('ident-gone')
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), /no longer on the Fastmail account/)
  })

  it("connect()'s own account has no sending identity — the send fails clearly instead of guessing one", async () => {
    restore = sendServer(() => jsonResponse({}))
    // No identity (empty sourceKey).
    const table = await contactForm('')
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), ConduitSourceError)
  })

  it('listFastmailIdentities returns every identity on the account, for a "Send as" picker', async () => {
    restore = sendServer(() => jsonResponse({}))
    const identities = await listFastmailIdentities(FASTMAIL, 'good-token')
    assert.deepEqual(identities, [
      { id: 'ident-1', email: 'you@fastmail.com', name: 'Ada' },
      { id: 'ident-2', email: 'sales@yourdomain.com', name: null },
    ])
    assert.equal(fetched.length, 2, 'the session, then one lookup')
  })
})
