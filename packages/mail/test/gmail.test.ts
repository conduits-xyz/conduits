import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { gmailTransport } from '../gmail.ts'
import type { TransportSend } from '../types.ts'
import { counter, fakeFetch, json, NOW } from './helpers.ts'

const API = 'https://gmail.example/gmail/v1'

function send(answer: () => Response | Promise<Response>, input: Partial<TransportSend> = {}) {
  const fake = fakeFetch(answer)
  const transport = gmailTransport({ apiUrl: API, fetch: fake.fetch, now: () => NOW })
  const result = transport.send({
    token: 'access',
    from: 'noreply@example.com',
    message: { to: ['a@example.com'], subject: 'Hi', text: 'Hello' },
    date: new Date(NOW),
    makeId: counter(),
    ...input,
  })
  return { result, requests: fake.requests }
}

describe('gmailTransport', () => {
  it('posts the whole message, base64url, as the token, and returns Gmail\'s id', async () => {
    const { result, requests } = send(() => json({ id: 'g1', threadId: 't1' }))
    assert.deepEqual(await result, { ok: true, messageId: 'g1' })
    assert.equal(requests[0]!.url, `${API}/users/me/messages/send`)
    assert.equal((requests[0]!.init!.headers as Record<string, string>).authorization, 'Bearer access')
    const raw = Buffer.from(JSON.parse(String(requests[0]!.init!.body)).raw, 'base64url').toString('utf8')
    assert.match(raw, /^From: noreply@example\.com\r\nTo: a@example\.com\r\n/)
    assert.match(raw, /Message-ID: <id1@example\.com>/)
  })

  it('maps each refusal to whether the message could have gone', async () => {
    const cases: [() => Response | Promise<Response>, string, number?][] = [
      [() => json({ error: { message: 'Invalid Credentials' } }, 401), 'auth_failed'],
      [() => json({ error: { message: 'Insufficient Permission', errors: [{ reason: 'insufficientPermissions' }] } }, 403), 'auth_failed'],
      [() => json({ error: { message: 'Too many', errors: [{ reason: 'rateLimitExceeded' }] } }, 429, { 'retry-after': '20' }), 'rate_limited', 20],
      [() => json({ error: { message: 'Daily limit', errors: [{ reason: 'dailyLimitExceeded' }] } }, 403), 'rate_limited', 30],
      [() => json({ error: { message: 'Invalid To header' } }, 400), 'rejected'],
      [() => json({ error: { message: 'Backend Error' } }, 500), 'outcome_unknown'],
      [() => Promise.reject(new TypeError('socket hang up')), 'outcome_unknown'],
      [() => json({}), 'outcome_unknown'],
    ]
    for (const [answer, code, retryAfter] of cases) {
      const result = (await send(answer).result) as { code: string; retryAfter?: number }
      assert.equal(result.code, code)
      assert.equal(result.retryAfter, retryAfter)
    }
  })
})
