import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createMailSender } from '../sender.ts'
import { fixedToken } from '../credentials.ts'
import type { Credential, SendResult, TransportSend } from '../types.ts'
import { counter, NOW } from './helpers.ts'

function recordingTransport(answer: SendResult) {
  const sends: TransportSend[] = []
  return { sends, transport: { send: async (input: TransportSend) => (sends.push(input), answer) } }
}

const MESSAGE = { to: ['a@example.com'], subject: 'Hi', text: 'Hello' }

describe('createMailSender', () => {
  it('hands the transport the token, the from address, the message and the instant', async () => {
    const { sends, transport } = recordingTransport({ ok: true, messageId: 'm1' })
    const sender = createMailSender({ transport, account: { from: 'noreply@example.com', credential: fixedToken('tok') }, now: () => NOW, makeId: counter() })
    assert.deepEqual(await sender.send(MESSAGE), { ok: true, messageId: 'm1' })
    assert.deepEqual([sends[0]!.token, sends[0]!.from, sends[0]!.message, sends[0]!.date.getTime()], ['tok', 'noreply@example.com', MESSAGE, NOW])
  })

  it('rejects a message it cannot send, without asking for a token', async () => {
    let asked = false
    const credential: Credential = { token: async () => ((asked = true), { ok: true, token: 't' }), forget() {} }
    const { transport } = recordingTransport({ ok: true, messageId: 'm1' })
    const result = await createMailSender({ transport, account: { credential }, now: () => NOW, makeId: counter() }).send({ ...MESSAGE, to: [] })
    assert.deepEqual(result, { ok: false, code: 'rejected', cause: 'no recipients' })
    assert.equal(asked, false)
  })

  it('passes on a credential failure, and forgets the token when the provider refuses it', async () => {
    let forgotten = 0
    const failing: Credential = { token: async () => ({ ok: false, code: 'unavailable', retryAfter: 9, cause: 'down' }), forget() {} }
    const { transport } = recordingTransport({ ok: false, code: 'auth_failed', cause: 'revoked' })
    assert.deepEqual(await createMailSender({ transport, account: { credential: failing }, now: () => NOW, makeId: counter() }).send(MESSAGE), { ok: false, code: 'unavailable', retryAfter: 9, cause: 'down' })

    const credential: Credential = { token: async () => ({ ok: true, token: 't' }), forget: () => void forgotten++ }
    assert.equal(((await createMailSender({ transport, account: { credential }, now: () => NOW, makeId: counter() }).send(MESSAGE)) as { code: string }).code, 'auth_failed')
    assert.equal(forgotten, 1)
  })
})
