import * as path from 'node:path'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { createTestServer } from 'remix/node-fetch-server/test'
import { createRouter } from 'remix/router'
import { staticFiles } from 'remix/middleware/static'

import { createGatewayRouter, createStaticRouteResolver, type GatewayRuntime, type ConduitConfig } from '@conduits/gateway'
import { compileConduits, resolveEnvRef } from '@conduits/config'

// conduit-url-input.js (this directory) is shared demo-page tooling —
// not part of any widget itself — whose one real behavioral claim is
// in its own top comment: a self-hosted single-process deployment
// serves its demo pages and its Gateway from the same origin, so a
// bare curi (no scheme, no host) can be resolved against
// `location.origin` and actually work. That claim had never been
// exercised end to end, in a real browser, against a real running
// Gateway — this file is what proves it.
//
// A real Fastmail-backed conduit (Mailpit, matching
// services/gateway/test/gateway.test.ts's own convention), not a mock
// — this file's own combined server plays the same role a self-hosted
// operator's single `services/gateway` process plus their own static
// hosting would in production, just serving both from one process
// instead of two.

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

// Minimal, self-contained GatewayRuntime — just enough to send a real
// email via Mailpit. Deliberately not imported from
// services/gateway/runtime.ts: that's a deployable service, this is a
// library package, and a library must not depend on a service that
// depends on it (@conduits/gateway) the other way around.
const testRuntime: GatewayRuntime = {
  async getCredential(config: ConduitConfig) {
    return config.credentialRef == null ? null : resolveEnvRef(config.credentialRef)
  },
  async invalidateCredential() {},
}

const WIDGETS_ROOT = path.resolve(import.meta.dirname, '..')

// Combines this directory's own static demo pages (xyz-waitlist/,
// conduit-url-input.js/.css) with a real gatewayRouter on one origin —
// static first, falling through to the Gateway on a 404 (staticFiles
// always falls through rather than throwing — see its own doc), the
// same shape a self-hosted operator's own reverse proxy would present
// to a browser. This static router carries no session/csrf/form-data
// middleware of its own, so a Gateway-shaped request always reaches
// that clean 404 and falls through correctly — a page router with its
// own such middleware would need to guard against it misfiring first.
function createCombinedServer(gatewayRouter: { fetch: (request: Request) => Response | Promise<Response> }) {
  const staticRouter = createRouter({ middleware: [staticFiles(WIDGETS_ROOT, { index: true })] })
  return async (request: Request): Promise<Response> => {
    const response = await staticRouter.fetch(request)
    if (response.status !== 404) return response
    return gatewayRouter.fetch(request)
  }
}

// A named conduit path can be used directly as a bare value.
const CURI = 'widgttest001'

function buildGatewayRouter(subject: string) {
  const { configs, bindings } = compileConduits(
    `
conduits:
  waitlist:
    curi: ${CURI}
    methods: [POST]
    source:
      type: fastmail
      identityId: widget-e2e-identity
      credential: env:WIDGET_E2E_FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: ${subject}
`,
    { supportedSourceTypes: ['fastmail'] },
  )
  const byCuri = new Map(configs.map((config) => [config.curi, config]))
  return createGatewayRouter({
    resolveConfig: async (curi) => byCuri.get(curi) ?? null,
    resolveRoute: createStaticRouteResolver(bindings),
    runtime: testRuntime,
  })
}

describe('conduit-url-input.js — bare curi resolved against the current origin (e2e)', () => {
  it('shows this origin as the prefix, resolves a bare curi against it, and completes a real signup', async (t) => {
    process.env.WIDGET_E2E_FASTMAIL_TOKEN = 'widget-e2e-fastmail-token'
    const subject = uniqueSubject('conduit-url-input bare-curi')
    const gatewayRouter = buildGatewayRouter(subject)
    const server = await createTestServer(createCombinedServer(gatewayRouter))
    const page = await t.serve(server)

    await page.goto(server.baseUrl + '/xyz-waitlist/')

    // The whole premise this file exists to prove: with the demo page
    // and the Gateway on one origin, the prefix shown is that same
    // origin, not hidden as it would be for an unknown (file://) one.
    await page.locator('#curi-prefix', { hasText: `${server.baseUrl}/` }).waitFor()

    await page.getByLabel('Conduit URL').fill(CURI)
    await page.getByRole('button', { name: 'Check' }).click()
    await page.getByText('Reachable.').waitFor()

    await page.getByLabel('First name').fill('Ada')
    await page.getByLabel('Email address').fill('ada@example.com')
    await page.getByRole('button', { name: 'Join the waitlist' }).click()
    await page.getByText("You're on the list", { exact: false }).waitFor()

    const messages = await mailpitMessagesWithSubject(subject)
    assert.equal(messages.length, 1)
    assert.equal(messages[0]?.To[0]?.Address, 'owner@example.com')
  })

  it('rejects a value that is not a valid conduit path, still against a known (non-file://) origin', async (t) => {
    process.env.WIDGET_E2E_FASTMAIL_TOKEN = 'widget-e2e-fastmail-token'
    const gatewayRouter = buildGatewayRouter(uniqueSubject('conduit-url-input malformed'))
    const server = await createTestServer(createCombinedServer(gatewayRouter))
    const page = await t.serve(server)

    await page.goto(server.baseUrl + '/xyz-waitlist/')
    await page.getByLabel('Conduit URL').fill('../invalid')
    await page.getByRole('button', { name: 'Check' }).click()
    // "Enter a valid conduit path." (not "...URL.") is only ever shown
    // once a prefix is known — see setupConduitUrlInput's own check().
    // Confirms this rejection took the bare-curi branch, not the
    // no-known-origin one.
    await page.getByText('Enter a valid conduit path.').waitFor()
  })
})
