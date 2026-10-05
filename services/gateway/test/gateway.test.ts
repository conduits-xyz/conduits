import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createGatewayRouter, createStaticRouteResolver, generateRequestId } from '@conduits/gateway'
import { FASTMAIL_CAPABILITIES } from '@conduits/conduit'
import { createRecordingSource } from '@conduits/conduit/testing'
import { compileConduits } from '@conduits/config'

import { createGatewayServiceRuntime } from '../runtime.ts'

// The service's composition of a YAML-compiled conduit, its runtime and
// the gateway, with a recording Fastmail source in place of the real
// client: what reaches the source is what Fastmail would be asked to
// send. The client itself is tested in @conduits/conduit.

function buildRouter(yamlText: string) {
  const { configs, bindings } = compileConduits(yamlText, { supportedSourceTypes: ['fastmail'] })
  const byCuri = new Map(configs.map((config) => [config.curi, config]))
  const fastmail = createRecordingSource(FASTMAIL_CAPABILITIES)
  const router = createGatewayRouter({
    sourceClients: { fastmail: fastmail.client },
    clock: { now: () => new Date(), monotonicMs: () => performance.now() },
    requestId: generateRequestId,
    resolveConfig: async (curi) => byCuri.get(curi) ?? null,
    resolveRoute: createStaticRouteResolver(bindings),
    // Fastmail conduits only: no Google token is ever refreshed.
    runtime: createGatewayServiceRuntime('/nonexistent/credentials.json', { endpoint: { tokenUrl: 'https://oauth.example/token', fetch }, now: Date.now }),
    listLimits: { default: 1000, max: 1000 },
  })
  return { router, sent: fastmail.created }
}

const CONTACT_FORM = `
conduits:
  contact-form:
    curi: contact-form
    methods: [POST]
    source:
      type: fastmail
      identityId: service-test-identity
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: Contact form
`

describe('gateway service', () => {
  it('hands a YAML-compiled fastmail conduit its identity, credential, recipients and the submitted fields, with no database anywhere in the path', async () => {
    process.env.FASTMAIL_TOKEN = 'service-test-token'
    const { router, sent } = buildRouter(CONTACT_FORM)

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
    const { router, sent } = buildRouter(`
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
      subject: Contact form
`)

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
    const { router, sent } = buildRouter(CONTACT_FORM)

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
    const { router } = buildRouter(CONTACT_FORM)

    const response = await router.fetch(new Request('http://localhost/contact-form'))
    assert.equal(response.status, 405)
  })

  it('404s for a curi this YAML never defined, same shape as the DB-backed gateway', async () => {
    const { router } = buildRouter('conduits: {}\n')
    const response = await router.fetch(new Request('http://localhost/does-not-exist'))
    assert.equal(response.status, 404)
  })
})
