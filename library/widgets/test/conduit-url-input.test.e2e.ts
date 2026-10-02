import * as path from 'node:path'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { createTestServer } from 'remix/node-fetch-server/test'
import { createRouter } from 'remix/router'
import { staticFiles } from 'remix/middleware/static'

import { createGatewayRouter, createStaticRouteResolver, type GatewayRuntime, type ConduitConfig } from '@conduits/gateway'
import { compileConduits, resolveEnvRef } from '@conduits/config'

// conduit-url-input.js resolves a bare curi against location.origin,
// which works when the demo pages and the Gateway share an origin, as
// in a self-hosted deployment. This checks that in a browser against a
// running Gateway, with a Fastmail conduit delivering to Mailpit (as in
// services/gateway/test/gateway.test.ts).

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

// A minimal GatewayRuntime that sends through Mailpit. Not imported from
// services/gateway/runtime.ts: a library package can't depend on a
// service.
const testRuntime: GatewayRuntime = {
  async getCredential(config: ConduitConfig) {
    return config.credentialRef == null ? null : resolveEnvRef(config.credentialRef)
  },
  async invalidateCredential() {},
}

const WIDGETS_ROOT = path.resolve(import.meta.dirname, '..')

// Serves the demo files and the gateway on one origin, as a self-hosted
// reverse proxy would: static files first, and the gateway when
// staticFiles finds nothing.
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

    // With the page and the Gateway on one origin, the field shows that
    // origin as its prefix (an unknown origin, like file://, shows none).
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
    // "Enter a valid conduit path." appears only when a prefix is known
    // (see check() in setupConduitUrlInput), so this took the bare-curi
    // branch.
    await page.getByText('Enter a valid conduit path.').waitFor()
  })

  // On a conduits.xyz host the page and the Gateway are on different
  // origins; knownOrigin() prefixes "run." instead of using
  // location.origin, where a bare curi would 404.
  it('on a *.conduits.xyz marketing host, prefixes with the sibling run.* data-plane host, never this same origin', async (t) => {
    const gatewayRouter = buildGatewayRouter(uniqueSubject('conduit-url-input run-prefix'))
    const server = await createTestServer(createCombinedServer(gatewayRouter))
    const page = await t.serve(server)

    // Playwright answers the navigation itself, so no DNS lookup
    // happens; the local server provides the content.
    await page.route('https://dev.conduits.xyz/**', async (route) => {
      const url = new URL(route.request().url())
      const response = await fetch(server.baseUrl + url.pathname + url.search, { method: route.request().method() })
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      })
    })

    await page.goto('https://dev.conduits.xyz/xyz-waitlist/')
    await page.locator('#curi-prefix', { hasText: 'https://run.dev.conduits.xyz/' }).waitFor()
  })
})
