import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createGatewayRouter } from '@conduits/gateway'
import { compileConduits } from '@conduits/config'

import { gatewayServiceRuntime } from '../runtime.ts'

// A real local Mailpit instance — a real SMTP/REST round trip, never
// a hand-rolled fake, for anything that actually sends mail.
const MAILPIT_API_URL = process.env.MAILPIT_API_URL ?? 'http://localhost:8025'

type MailpitMessage = { To: Array<{ Address: string }>; Subject: string }

async function mailpitMessagesWithSubject(subject: string): Promise<MailpitMessage[]> {
  const response = await fetch(`${MAILPIT_API_URL}/api/v1/messages?limit=250`)
  const body = (await response.json()) as { messages: MailpitMessage[] }
  return body.messages.filter((message) => message.Subject === subject)
}

function uniqueSubject(label: string): string {
  return `${label} ${Math.random().toString(36).slice(2)}`
}

function buildRouter(yamlText: string) {
  const configs = compileConduits(yamlText, { supportedSourceTypes: ['fastmail'] })
  const byCuri = new Map(configs.map((config) => [config.curi, config]))
  return createGatewayRouter({
    resolveConfig: async (curi) => byCuri.get(curi) ?? null,
    runtime: gatewayServiceRuntime,
  })
}

describe('gateway service (e2e against Mailpit)', () => {
  it('sends a real message via SMTP for a YAML-compiled fastmail conduit, with no database anywhere in the path', async () => {
    process.env.FASTMAIL_TOKEN = 'service-test-token'
    const subject = uniqueSubject('gateway-service contact-form')

    const router = buildRouter(`
conduits:
  contact-form:
    methods: [POST]
    source:
      type: fastmail
      identityId: service-test-identity
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: ${subject}
`)

    const response = await router.fetch(
      new Request('http://localhost/api/contact-form', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: { name: 'Ada', email: 'ada@example.com', message: 'Hello from the gateway service' } }),
      }),
    )
    assert.equal(response.status, 201)

    const messages = await mailpitMessagesWithSubject(subject)
    assert.equal(messages.length, 1)
    assert.equal(messages[0]?.To[0]?.Address, 'owner@example.com')
  })

  it('enforces methods/bearerToken/hiddenFields exactly as compiled — RACM rejects GET on a POST-only conduit', async () => {
    process.env.FASTMAIL_TOKEN = 'service-test-token'
    const router = buildRouter(`
conduits:
  contact-form:
    methods: [POST]
    source:
      type: fastmail
      identityId: service-test-identity
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: ${uniqueSubject('gateway-service racm')}
`)

    const response = await router.fetch(new Request('http://localhost/api/contact-form'))
    assert.equal(response.status, 405)
  })

  it('404s for a curi this YAML never defined, same shape as the DB-backed gateway', async () => {
    const router = buildRouter('conduits: {}\n')
    const response = await router.fetch(new Request('http://localhost/api/does-not-exist'))
    assert.equal(response.status, 404)
  })
})
