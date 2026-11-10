import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { jmapTransport } from '../jmap.ts'
import type { TransportSend } from '../types.ts'
import { counter, fakeFetch, json, NOW } from './helpers.ts'

const SESSION_URL = 'https://jmap.example/session'
const API_URL = 'https://jmap.example/api'

type Call = [string, Record<string, unknown>, string]

// A JMAP server: the session, the lookup, and `onSend` for the send.
function server(onSend: (calls: Call[]) => Response | Promise<Response> = sent) {
  return fakeFetch(async (url, init) => {
    if (url === SESSION_URL) return json({ apiUrl: API_URL, primaryAccounts: { 'urn:ietf:params:jmap:mail': 'A1' } })
    const calls = (JSON.parse(String(init!.body)) as { methodCalls: Call[] }).methodCalls
    if (calls[0]![0] === 'Identity/get') {
      return json({
        methodResponses: [
          ['Identity/get', { list: [{ id: 'I1', email: 'noreply@example.com', name: 'Example' }] }, 'identities'],
          ['Mailbox/get', { list: [{ id: 'M1', name: 'Inbox', role: 'inbox' }, { id: 'M2', name: 'Drafts', role: 'drafts' }] }, 'mailboxes'],
        ],
      })
    }
    if (calls[0]![1].destroy) return json({ methodResponses: [['Email/set', { destroyed: calls[0]![1].destroy }, 'cleanup']] })
    return onSend(calls)
  })
}

function sent(): Response {
  return json({
    methodResponses: [
      ['Email/set', { created: { draft: { id: 'E1' } } }, 'draft'],
      ['EmailSubmission/set', { created: { send: { id: 'S1' } } }, 'send'],
      ['Email/set', { destroyed: ['E1'] }, 'send'],
    ],
  })
}

function transport(fake: ReturnType<typeof fakeFetch>) {
  const t = jmapTransport({ sessionUrl: SESSION_URL, fetch: fake.fetch, now: () => NOW })
  return (input: Partial<TransportSend> = {}) =>
    t.send({ token: 'tok', from: 'noreply@example.com', message: { to: ['a@example.com'], subject: 'Hi', text: 'Hello', html: '<p>Hello</p>' }, date: new Date(NOW), makeId: counter(), ...input })
}

describe('jmapTransport', () => {
  it('creates the draft as the matching identity and submits it in one request, looking the account up once', async () => {
    const fake = server()
    const send = transport(fake)
    assert.deepEqual(await send(), { ok: true, messageId: 'E1' })
    assert.deepEqual(await send(), { ok: true, messageId: 'E1' })
    assert.deepEqual(fake.requests.map((r) => r.url), [SESSION_URL, API_URL, API_URL, API_URL])

    const [create, submit] = (JSON.parse(String(fake.requests[2]!.init!.body)) as { methodCalls: Call[] }).methodCalls
    const draft = (create![1].create as { draft: Record<string, unknown> }).draft
    assert.deepEqual(draft.mailboxIds, { M2: true })
    assert.deepEqual(draft.from, [{ email: 'noreply@example.com', name: 'Example' }])
    assert.deepEqual(draft.messageId, ['id1@example.com'])
    assert.equal(draft.sentAt, '2026-10-05T12:00:00.000Z')
    assert.deepEqual(draft.bodyValues, { text: { value: 'Hello' }, html: { value: '<p>Hello</p>' } })
    assert.deepEqual(submit![1], { accountId: 'A1', onSuccessDestroyEmail: ['#send'], create: { send: { emailId: '#draft', identityId: 'I1' } } })
  })

  it('gives the account from the lookup a send then reuses', async () => {
    const fake = server()
    const t = jmapTransport({ sessionUrl: SESSION_URL, fetch: fake.fetch, now: () => NOW })
    assert.deepEqual(await t.account('tok'), {
      apiUrl: API_URL,
      accountId: 'A1',
      identities: [{ id: 'I1', email: 'noreply@example.com', name: 'Example' }],
      mailboxes: [{ id: 'M1', name: 'Inbox', role: 'inbox' }, { id: 'M2', name: 'Drafts', role: 'drafts' }],
    })
    await t.send({ token: 'tok', from: 'noreply@example.com', message: { to: ['a@example.com'], subject: 'Hi', text: 'Hello' }, date: new Date(NOW), makeId: counter() })
    assert.equal(fake.requests.length, 3)
  })

  it('refuses a from address the account has no identity for', async () => {
    const result = await transport(server())({ from: 'someone@example.com' })
    assert.deepEqual(result, { ok: false, code: 'rejected', cause: 'the account has no identity for someone@example.com' })
  })

  it('reports an unsent submission by its SetError type, and removes the draft', async () => {
    const fake = server(() =>
      json({
        methodResponses: [
          ['Email/set', { created: { draft: { id: 'E1' } } }, 'draft'],
          ['EmailSubmission/set', { notCreated: { send: { type: 'forbiddenToSend', description: 'limit' } } }, 'send'],
        ],
      }),
    )
    assert.deepEqual(await transport(fake)(), { ok: false, code: 'rate_limited', retryAfter: 30, cause: 'EmailSubmission/set: forbiddenToSend (limit)' })
    const cleanup = (JSON.parse(String(fake.requests.at(-1)!.init!.body)) as { methodCalls: Call[] }).methodCalls[0]!
    assert.deepEqual(cleanup[1], { accountId: 'A1', destroy: ['E1'] })
  })

  it('separates refusals before sending from a send whose outcome is unknown', async () => {
    const refusedSession = fakeFetch(() => json({}, 401))
    assert.equal(((await transport(refusedSession)()) as { code: string }).code, 'auth_failed')

    const busy = server(() => json({}, 429, { 'retry-after': '5' }))
    assert.deepEqual(await transport(busy)(), { ok: false, code: 'unavailable', retryAfter: 5, cause: 'JMAP send 429' })

    const failed = server(() => json({}, 500))
    assert.equal(((await transport(failed)()) as { code: string }).code, 'outcome_unknown')

    const lost = server(() => Promise.reject(new TypeError('socket hang up')))
    assert.deepEqual(await transport(lost)(), { ok: false, code: 'outcome_unknown', cause: 'JMAP: socket hang up' })

    const draftRefused = server(() => json({ methodResponses: [['Email/set', { notCreated: { draft: { type: 'invalidProperties' } } }, 'draft'], ['error', { type: 'invalidResultReference' }, 'send']] }))
    assert.deepEqual(await transport(draftRefused)(), { ok: false, code: 'rejected', cause: 'Email/set: invalidProperties' })
  })

  it('reports a lookup the server refused at the method level, before sending', async () => {
    const fake = fakeFetch(async (url) => {
      if (url === SESSION_URL) return json({ apiUrl: API_URL, primaryAccounts: { 'urn:ietf:params:jmap:mail': 'A1' } })
      return json({ methodResponses: [['error', { type: 'accountNotFound' }, 'identities'], ['error', { type: 'accountNotFound' }, 'mailboxes']] })
    })
    assert.deepEqual(await transport(fake)(), { ok: false, code: 'rejected', cause: 'Identity/get: accountNotFound' })
  })

  it('throws for a missing from: a programming error, not an outcome', async () => {
    await assert.rejects(transport(server())({ from: undefined }), /needs a from address/)
  })
})
