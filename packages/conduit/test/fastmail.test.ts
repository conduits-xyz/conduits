import * as assert from 'remix/assert'
import { describe, it, afterEach } from 'remix/test'

import { createFastmailClient, listFastmailIdentities } from '../fastmail.ts'
import { ConduitAuthError, ConduitCursorError, ConduitPreconditionError, ConduitRateLimitError, ConduitSourceError, type ConduitRecord } from '../sheets.ts'

// The endpoint, with a fetch that calls whatever global fetch the
// test's mock has installed.
const FASTMAIL = { sessionUrl: 'https://api.fastmail.com/jmap/session', fetch: ((input, init) => globalThis.fetch(input, init)) as typeof fetch, now: () => Date.parse('2026-10-05T12:00:00.000Z'), makeId: () => 'id' }
import { jsonResponse, replaceFetch } from './helpers.ts'

// The JMAP client with a mocked fetch.

const API_URL = 'https://api.fastmail.example/jmap/api/'
const ACCOUNT_ID = 'u1'

// A JMAP request's body, as the mock receives it.
type JmapRequest = { methodCalls: Array<[string, Record<string, unknown>, string]> }

// Every URL the mock was asked for, in order.
let fetched: string[] = []

function mockFetch(handlers: {
  session?: () => Response
  jmap?: (method: string, body: JmapRequest) => Response
}): () => void {
  fetched = []
  return replaceFetch((url, init) => {
    fetched.push(url)
    if (url.endsWith('/jmap/session')) {
      return handlers.session?.() ?? new Response('not mocked', { status: 500 })
    }
    if (url === API_URL) {
      const parsed = JSON.parse(String(init?.body)) as JmapRequest
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

  // The JMAP server of an account: the lookup, then every other call
  // (a send through @m5nv/mail's transport, or a list) answered by
  // `answer`.
  function accountServer(answer: (body: JmapRequest) => Response) {
    return mockFetch({
      session: () => jsonResponse({ apiUrl: API_URL, primaryAccounts: { 'urn:ietf:params:jmap:mail': ACCOUNT_ID } }),
      jmap: (method, body) => {
        if (method === 'Identity/get') {
          return jsonResponse({
            methodResponses: [
              ['Identity/get', { list: [{ id: 'ident-1', email: 'you@fastmail.com', name: 'Ada' }, { id: 'ident-2', email: 'sales@yourdomain.com', name: '' }] }, 'identities'],
              ['Mailbox/get', { list: [{ id: 'inbox-1', role: 'inbox', name: 'Inbox' }, { id: 'drafts-1', role: 'drafts', name: 'Drafts' }, { id: 'trash-1', role: 'trash', name: 'Trash' }] }, 'mailboxes'],
            ],
          })
        }
        return answer(body)
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
    let captured: JmapRequest | undefined
    restore = accountServer((body) => {
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

  // Without a sort, the order is the server's choice (RFC 8621, 4.4), and
  // a page that starts after the last email of the page before could
  // repeat or skip a message.
  it('lists the Inbox newest first, by asking the server for that order', async () => {
    let query: Record<string, unknown> | undefined
    restore = accountServer((body) => {
      query = body.methodCalls[0]![1]
      return jsonResponse({ methodResponses: [['Email/query', { ids: [] }, '0'], ['Email/get', { list: [] }, '1']] })
    })
    const table = await contactForm('ident-1')
    await table.listRecords({ limit: 10 })

    assert.deepEqual(query!.sort, [{ property: 'receivedAt', isAscending: false }])
  })

  it('starts the next page after the last email of the page before, and refuses a cursor whose email is gone', async () => {
    const queries: Record<string, unknown>[] = []
    restore = accountServer((body) => {
      const query = body.methodCalls[0]![1]
      queries.push(query)
      if (query.anchor === 'gone') return jsonResponse({ methodResponses: [['error', { type: 'anchorNotFound' }, '0']] })
      // Email/get's list need not follow the query's order.
      const email = (id: string) => ({ id, from: [], to: [], subject: '', receivedAt: '2026-10-05T12:00:00Z', preview: '' })
      return jsonResponse({ methodResponses: [['Email/query', { ids: ['m3', 'm2'] }, '0'], ['Email/get', { list: [email('m2'), email('m3')] }, '1']] })
    })
    const table = await contactForm('ident-1')

    const first = await table.listRecords({ limit: 2 })
    assert.equal(first.nextCursor, 'm2')
    await table.listRecords({ cursor: first.nextCursor!, limit: 2 })
    assert.equal(queries[1]!.anchor, 'm2')
    assert.equal(queries[1]!.anchorOffset, 1)
    assert.equal(queries[1]!.position, undefined)
    await assert.rejects(() => table.listRecords({ cursor: 'gone', limit: 2 }), ConduitCursorError)
  })

  it('checks a delete\'s condition on the emails as read, and moves nothing to Trash if one fails', async () => {
    const methods: string[] = []
    const email = { id: 'm1', from: [{ email: 'ada@example.com' }], to: [], subject: 'Hi', receivedAt: '2026-10-05T12:00:00Z', preview: 'Hello' }
    restore = accountServer((body) => {
      const [method] = body.methodCalls[0]!
      methods.push(method)
      if (method === 'Email/get') return jsonResponse({ methodResponses: [['Email/get', { list: [email] }, '0']] })
      return jsonResponse({ methodResponses: [['Email/set', { updated: { m1: null }, notUpdated: {} }, '0']] })
    })
    const table = await contactForm('ident-1')

    await assert.rejects(() => table.deleteRecord('m1', () => false), ConduitPreconditionError)
    assert.deepEqual(methods, ['Email/get'])
    let checked: ConduitRecord | undefined
    assert.equal(await table.deleteRecord('m1', (current) => ((checked = current), true)), true)
    assert.deepEqual(methods, ['Email/get', 'Email/get', 'Email/set'])
    assert.deepEqual(checked!.fields, { from: 'ada@example.com', to: null, subject: 'Hi', body: 'Hello', date: '2026-10-05T12:00:00Z' })
  })

  it('a draft created but never submitted fails with a 502, after removing the draft', async () => {
    restore = accountServer(submissionRefused('invalidRecipients'))
    const table = await contactForm('ident-1')
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), (error: unknown) => error instanceof ConduitSourceError && error.status === 502)
  })

  it('a send Fastmail refuses for a sending limit is busy, with a Retry-After', async () => {
    restore = accountServer(submissionRefused('forbiddenToSend'))
    const table = await contactForm('ident-1')
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), (error: unknown) => error instanceof ConduitRateLimitError && error.retryAfterSeconds === 30)
  })

  it('an identity no longer on the account fails clearly', async () => {
    restore = accountServer(() => jsonResponse({}))
    const table = await contactForm('ident-gone')
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), /no longer on the Fastmail account/)
  })

  it("connect()'s own account has no sending identity — the send fails clearly instead of guessing one", async () => {
    restore = accountServer(() => jsonResponse({}))
    // No identity (empty sourceKey).
    const table = await contactForm('')
    await assert.rejects(() => table.createRecord({ name: 'Ada' }), ConduitSourceError)
  })

  it('listFastmailIdentities returns every identity on the account, for a "Send as" picker', async () => {
    restore = accountServer(() => jsonResponse({}))
    const identities = await listFastmailIdentities(FASTMAIL, 'good-token')
    assert.deepEqual(identities, [
      { id: 'ident-1', email: 'you@fastmail.com', name: 'Ada' },
      { id: 'ident-2', email: 'sales@yourdomain.com', name: null },
    ])
    assert.equal(fetched.length, 2, 'the session, then one lookup')
  })
})
