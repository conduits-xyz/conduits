import * as assert from 'remix/assert'
import { describe, it, beforeEach } from 'remix/test'
import { resetFakeSheets, seedFakeSheet } from '@conduits/conduit'
import type { PageSpec } from '@conduits/presentation'

import { createGatewayRouter } from '../router.ts'
import { resetThrottle } from '../middleware/throttle.ts'
import type { ConduitConfig, GatewayRuntime } from '../types.ts'
import { createStaticRouteResolver, type RouteBinding } from '../route-binding.ts'

// Hosted pages — dispatch.ts's bare-GET content negotiation and hosted
// page/failure rendering, end to end against createGatewayRouter with
// nothing but a plain ConduitConfig and the real googleSheets fake test
// client (already exercised this way by @conduits/conduit's own
// exports) — no DB, no filesystem, no real network. Complements the
// pure unit coverage in content-negotiation.test.ts and
// @conduits/presentation's own render.test.ts; the deeper real-browser
// e2e coverage of an actual authoring flow lives with whichever
// dashboard produces a PageSpec, outside this package's own scope.

const CURI = 'page-smoke'
const SOURCE_KEY = 'page-smoke-sheet'

const formPage: PageSpec = {
  version: 1,
  blocks: [{ title: 'Feedback', widgets: [{ type: 'xyz-form', props: { fields: [{ name: 'name', label: 'Name', type: 'text', required: true }] } }] }],
}

const tablePage: PageSpec = {
  version: 1,
  blocks: [{ widgets: [{ type: 'xyz-table', props: { columns: [{ field: 'name' }] } }] }],
}

function baseConfig(overrides: Partial<ConduitConfig> = {}): ConduitConfig {
  return {
    curi: CURI,
    allowlist: [],
    racm: ['GET', 'POST'],
    throttle: false,
    tokenRequiredMethods: [],
    bearerTokenHash: null,
    suriType: 'googleSheets',
    suriObjectKey: SOURCE_KEY,
    suriConfig: {},
    hiddenFormField: [],
    credentialRef: null,
    presentation: null,
    ...overrides,
  }
}

const bindings: RouteBinding[] = [{ path: `/${CURI}`, curi: CURI }]

const runtime: GatewayRuntime = {
  async getCredential() {
    return 'fake-credential'
  },
  async invalidateCredential() {},
}

function makeRouter(config: ConduitConfig) {
  return createGatewayRouter({
    resolveConfig: async (curi) => (curi === CURI ? config : null),
    resolveRoute: createStaticRouteResolver(bindings),
    runtime,
  })
}

describe('Hosted page dispatch', () => {
  beforeEach(() => {
    resetFakeSheets()
    resetThrottle()
  })

  it('a browser-style Accept header renders the hosted page when one is configured', async () => {
    const router = makeRouter(baseConfig({ presentation: formPage }))
    const response = await router.fetch(
      new Request(`http://localhost/${CURI}`, { headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } }),
    )
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /text\/html/)
    const body = await response.text()
    assert.match(body, /<xyz-form>/)
    assert.match(body, /Feedback/)
  })

  it('a missing Accept header preserves the existing JSON representation', async () => {
    const router = makeRouter(baseConfig({ presentation: formPage }))
    const response = await router.fetch(new Request(`http://localhost/${CURI}`))
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  })

  it('Accept: */* preserves the existing JSON representation', async () => {
    const router = makeRouter(baseConfig({ presentation: formPage }))
    const response = await router.fetch(new Request(`http://localhost/${CURI}`, { headers: { accept: '*/*' } }))
    assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  })

  it('a disabled (unconfigured) page never renders HTML, even with a browser Accept header', async () => {
    const router = makeRouter(baseConfig({ presentation: null }))
    const response = await router.fetch(new Request(`http://localhost/${CURI}`, { headers: { accept: 'text/html' } }))
    assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  })

  it('API GET security and page visibility are independent: a bearer-token-gated GET still 401s for JSON', async () => {
    const router = makeRouter(baseConfig({ presentation: formPage, tokenRequiredMethods: ['GET'], bearerTokenHash: 'unused-hash' }))
    const response = await router.fetch(new Request(`http://localhost/${CURI}`))
    assert.equal(response.status, 401)
  })

  it('...but the same conduit still serves its public hosted page with no Authorization header at all', async () => {
    const router = makeRouter(baseConfig({ presentation: formPage, tokenRequiredMethods: ['GET'], bearerTokenHash: 'unused-hash' }))
    const response = await router.fetch(new Request(`http://localhost/${CURI}`, { headers: { accept: 'text/html' } }))
    assert.equal(response.status, 200)
    assert.match(response.headers.get('content-type') ?? '', /text\/html/)
  })

  it('renders a real xyz-table from the actual provider data, through the same read path as the JSON list', async () => {
    seedFakeSheet(SOURCE_KEY, [{ name: 'Ada' }, { name: 'Grace' }])
    const router = makeRouter(baseConfig({ presentation: tablePage }))
    const response = await router.fetch(new Request(`http://localhost/${CURI}`, { headers: { accept: 'text/html' } }))
    const body = await response.text()
    assert.match(body, /Ada/)
    assert.match(body, /Grace/)
  })

  it('a successful hosted-form submission still uses the existing PRG redirect, unchanged', async () => {
    const router = makeRouter(baseConfig({ presentation: formPage }))
    const response = await router.fetch(
      new Request(`http://localhost/${CURI}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html', referer: 'http://localhost/' + CURI },
        body: `name=Ada&_redirect=${encodeURIComponent(`/${CURI}?submitted=1`)}`,
      }),
    )
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('location'), `http://localhost/${CURI}?submitted=1`)
  })

  it('a failed submission never exposes raw JSON to a hosted-page visitor — a generic HTML failure instead', async () => {
    const router = makeRouter(baseConfig({ presentation: formPage }))
    const response = await router.fetch(
      new Request(`http://localhost/${CURI}`, {
        method: 'POST',
        // A caller-supplied id makes write() reject with 400 — see
        // controller.ts's own hasBodyId check.
        headers: { 'content-type': 'application/json', accept: 'text/html' },
        body: JSON.stringify({ id: 'not-allowed', fields: { name: 'Ada' } }),
      }),
    )
    assert.equal(response.status, 400)
    assert.match(response.headers.get('content-type') ?? '', /text\/html/)
    const body = await response.text()
    assert.doesNotMatch(body, /\{"error"/)
    assert.match(body, /Something went wrong/)
  })

  it('the same failure stays plain JSON for a non-HTML-preferring caller', async () => {
    const router = makeRouter(baseConfig({ presentation: formPage }))
    const response = await router.fetch(
      new Request(`http://localhost/${CURI}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: 'not-allowed', fields: { name: 'Ada' } }),
      }),
    )
    assert.equal(response.status, 400)
    assert.match(response.headers.get('content-type') ?? '', /application\/json/)
  })

  it('schema/meta routes stay independent of the hosted-page representation decision', async () => {
    const router = makeRouter(baseConfig({ presentation: formPage, bearerTokenHash: 'unused-hash' }))
    const response = await router.fetch(new Request(`http://localhost/${CURI}/.conduits/schema`, { headers: { accept: 'text/html' } }))
    // Schema still unconditionally requires its own bearer token,
    // completely unaffected by this conduit having a public page.
    assert.equal(response.status, 401)
  })
})
