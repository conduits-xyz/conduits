import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { buildMessage, encodeHeader, formatDate, messageIdFor, messageProblem } from '../message.ts'

const decode = (raw: string) => {
  const [head, ...rest] = raw.split('\r\n\r\n')
  return { head: head!, body: rest.join('\r\n\r\n') }
}

describe('messages', () => {
  it('builds a text message with base64 UTF-8 body and the given Date and Message-ID', () => {
    const raw = buildMessage({ from: 'noreply@example.com', message: { to: ['a@example.com', 'b@example.com'], subject: 'Hi', text: 'Héllo' }, date: new Date('2026-10-05T12:00:00Z'), messageId: '<m1@example.com>', boundary: 'b1' })
    const { head, body } = decode(raw)
    assert.match(head, /^From: noreply@example\.com\r\nTo: a@example\.com, b@example\.com\r\nSubject: Hi\r\nDate: Mon, 05 Oct 2026 12:00:00 \+0000\r\nMessage-ID: <m1@example\.com>\r\nMIME-Version: 1\.0\r\nContent-Type: text\/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64$/)
    assert.equal(Buffer.from(body, 'base64').toString('utf8'), 'Héllo')
  })

  it('builds text and HTML as multipart/alternative, and leaves From out when there is none', () => {
    const raw = buildMessage({ from: undefined, message: { to: ['a@example.com'], subject: 'Hi', text: 'plain', html: '<p>rich</p>' }, date: new Date(0), messageId: '<m@localhost>', boundary: 'b1' })
    assert.doesNotMatch(raw, /^From:/m)
    assert.match(raw, /Content-Type: multipart\/alternative; boundary="b1"/)
    const parts = raw.split('--b1').slice(1, 3).map((part) => Buffer.from(part.split('\r\n\r\n')[1]!.trim(), 'base64').toString('utf8'))
    assert.deepEqual(parts, ['plain', '<p>rich</p>'])
    assert.match(raw, /--b1--\r\n$/)
  })

  it('encodes a non-ASCII subject, and formats dates and message ids', () => {
    assert.equal(encodeHeader('Plain'), 'Plain')
    assert.equal(encodeHeader('Vérifiez'), `=?UTF-8?B?${Buffer.from('Vérifiez').toString('base64')}?=`)
    assert.equal(formatDate(new Date('2026-01-02T03:04:05Z')), 'Fri, 02 Jan 2026 03:04:05 +0000')
    assert.equal(messageIdFor('x1', 'noreply@conduits.example'), '<x1@conduits.example>')
    assert.equal(messageIdFor('x1', undefined), '<x1@localhost>')
  })

  it('refuses no recipients, line breaks in header values, and malformed addresses', () => {
    const ok = { to: ['a@example.com'], subject: 's', text: 't' }
    assert.equal(messageProblem('n@example.com', ok), null)
    assert.equal(messageProblem(undefined, { ...ok, to: [] }), 'no recipients')
    assert.equal(messageProblem(undefined, { ...ok, subject: 'a\r\nBcc: x@example.com' }), 'a header value contains a line break')
    assert.equal(messageProblem('not-an-address', ok), 'an address is not of the form name@domain')
  })
})
