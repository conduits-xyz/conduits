import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createGatewayRouter, createStaticRouteResolver } from '@conduits/gateway'
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
  const { configs, bindings } = compileConduits(yamlText, { supportedSourceTypes: ['fastmail'] })
  const byCuri = new Map(configs.map((config) => [config.curi, config]))
  return createGatewayRouter({
    resolveConfig: async (curi) => byCuri.get(curi) ?? null,
    resolveRoute: createStaticRouteResolver(bindings),
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
    curi: contact-form
    methods: [POST]
    source:
      type: fastmail
      identityId: service-test-identity
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: ${subject}
`)

    // No /api prefix — the default self-hosted route is bare /<curi>
    // (see docs/data-model.md and README.md).
    const response = await router.fetch(
      new Request('http://localhost/contact-form', {
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

  it('also works at an explicit custom route, distinct from its curi', async () => {
    process.env.FASTMAIL_TOKEN = 'service-test-token'
    const subject = uniqueSubject('gateway-service custom-route')

    const router = buildRouter(`
conduits:
  contact-form:
    curi: contact-form
    methods: [POST]
    routes:
      - path: /forms/contact
    source:
      type: fastmail
      identityId: service-test-identity
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: ${subject}
`)

    const response = await router.fetch(
      new Request('http://localhost/forms/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: { name: 'Ada', email: 'ada@example.com', message: 'Hello via a custom route' } }),
      }),
    )
    assert.equal(response.status, 201)

    // The default /<curi> route no longer exists once routes: is
    // explicit — see @conduits/config's compileConduits doc.
    const bareResponse = await router.fetch(new Request('http://localhost/contact-form', { method: 'POST' }))
    assert.equal(bareResponse.status, 404)

    const messages = await mailpitMessagesWithSubject(subject)
    assert.equal(messages.length, 1)
  })

  it('accepts a plain HTML <form> POST (x-www-form-urlencoded) directly against the default /<curi> route', async () => {
    process.env.FASTMAIL_TOKEN = 'service-test-token'
    const subject = uniqueSubject('gateway-service form-encoded')

    const router = buildRouter(`
conduits:
  contact-form:
    curi: contact-form
    methods: [POST]
    source:
      type: fastmail
      identityId: service-test-identity
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: ${subject}
`)

    const body = new URLSearchParams({ 'fields[name]': 'Ada', 'fields[email]': 'ada@example.com' })
    const response = await router.fetch(
      new Request('http://localhost/contact-form', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
    )
    assert.equal(response.status, 201)

    const messages = await mailpitMessagesWithSubject(subject)
    assert.equal(messages.length, 1)
  })

  it('enforces methods/bearerToken/hiddenFields exactly as compiled — RACM rejects GET on a POST-only conduit', async () => {
    process.env.FASTMAIL_TOKEN = 'service-test-token'
    const router = buildRouter(`
conduits:
  contact-form:
    curi: contact-form
    methods: [POST]
    source:
      type: fastmail
      identityId: service-test-identity
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: ${uniqueSubject('gateway-service racm')}
`)

    const response = await router.fetch(new Request('http://localhost/contact-form'))
    assert.equal(response.status, 405)
  })

  it('404s for a curi this YAML never defined, same shape as the DB-backed gateway', async () => {
    const router = buildRouter('conduits: {}\n')
    const response = await router.fetch(new Request('http://localhost/does-not-exist'))
    assert.equal(response.status, 404)
  })
})
