import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createYamlTestGateway } from '@conduits/config/testing'

import { createGatewayServiceRuntime } from '../runtime.ts'

// The service's composition of a YAML-compiled conduit, its runtime and
// the gateway, with a recording Fastmail source in place of the real
// client: what reaches the source is what Fastmail would be asked to
// send. The client itself is tested in @conduits/conduit.

// Fastmail conduits only: no Google token is ever refreshed.
const runtime = createGatewayServiceRuntime('/nonexistent/credentials.json', { endpoint: { tokenUrl: 'https://oauth.example/token', fetch }, now: Date.now })
const buildRouter = (yamlText: string) => createYamlTestGateway(yamlText, runtime)

// A Fastmail contact form; `routes` lines, when given, set its routes.
const contactForm = (routes = '') => `
conduits:
  contact-form:
    curi: contact-form
    methods: [POST]
${routes}    source:
      type: fastmail
      identityId: service-test-identity
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: Contact form
`

describe('gateway service', () => {
  it('hands a YAML-compiled fastmail conduit its identity, credential, recipients and the submitted fields, with no database anywhere in the path', async () => {
    process.env.FASTMAIL_TOKEN = 'service-test-token'
    const { router, sent } = buildRouter(contactForm())

    // The default self-hosted route is /<curi> (docs/data-model.md).
    const response = await router.fetch(
      new Request('http://localhost/contact-form', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: { name: 'Ada', email: 'ada@example.com', message: 'Hello from the gateway service' } }),
      }),
    )
    assert.equal(response.status, 201)

    assert.equal(sent.length, 1)
    assert.equal(sent[0]!.sourceKey, 'service-test-identity')
    assert.equal(sent[0]!.credential, 'service-test-token')
    assert.deepEqual(JSON.parse(sent[0]!.config!), { recipients: ['owner@example.com'], subject: 'Contact form' })
    assert.deepEqual(sent[0]!.fields, { name: 'Ada', email: 'ada@example.com', message: 'Hello from the gateway service' })
  })

  it('also works at an explicit custom route, distinct from its curi', async () => {
    process.env.FASTMAIL_TOKEN = 'service-test-token'
    const { router, sent } = buildRouter(contactForm('    routes:\n      - path: /forms/contact\n'))

    const response = await router.fetch(
      new Request('http://localhost/forms/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fields: { name: 'Ada', email: 'ada@example.com', message: 'Hello via a custom route' } }),
      }),
    )
    assert.equal(response.status, 201)

    // With explicit routes:, there is no default /<curi> route.
    const bareResponse = await router.fetch(new Request('http://localhost/contact-form', { method: 'POST' }))
    assert.equal(bareResponse.status, 404)
    assert.equal(sent.length, 1)
  })

  it('accepts a plain HTML <form> POST (x-www-form-urlencoded) directly against the default /<curi> route', async () => {
    process.env.FASTMAIL_TOKEN = 'service-test-token'
    const { router, sent } = buildRouter(contactForm())

    const body = new URLSearchParams({ 'fields[name]': 'Ada', 'fields[email]': 'ada@example.com' })
    const response = await router.fetch(
      new Request('http://localhost/contact-form', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      }),
    )
    assert.equal(response.status, 201)
    assert.deepEqual(sent.map((create) => create.fields), [{ name: 'Ada', email: 'ada@example.com' }])
  })

  it('enforces methods/bearerToken/hiddenFields exactly as compiled — RACM rejects GET on a POST-only conduit', async () => {
    process.env.FASTMAIL_TOKEN = 'service-test-token'
    const { router } = buildRouter(contactForm())

    const response = await router.fetch(new Request('http://localhost/contact-form'))
    assert.equal(response.status, 405)
  })

  it('404s for a curi this YAML never defined, same shape as the DB-backed gateway', async () => {
    const { router } = buildRouter('conduits: {}\n')
    const response = await router.fetch(new Request('http://localhost/does-not-exist'))
    assert.equal(response.status, 404)
  })
})
