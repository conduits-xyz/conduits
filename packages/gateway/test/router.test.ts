import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createGatewayRouter } from '../router.ts'
import type { ConduitConfig, GatewayRuntime } from '../types.ts'
import { createStaticRouteResolver, type RouteBinding } from '../route-binding.ts'

// This package's own behavior is exercised in depth by every consumer's
// test suite (services/gateway/test/, here in this repo) rather than
// duplicated here — but the package itself, in isolation, still needs
// at least one real smoke test: this is the one place that proves
// createGatewayRouter() works end to end against nothing but a plain
// ConduitConfig, a RouteBinding, and a fake GatewayRuntime, with zero
// DB, zero filesystem, zero real network.

const config: ConduitConfig = {
  curi: 'smoke-test',
  allowlist: [],
  racm: ['GET'],
  throttle: false,
  tokenRequiredMethods: [],
  bearerTokenHash: null,
  suriType: 'fake',
  suriObjectKey: 'unused',
  suriConfig: {},
  hiddenFormField: [],
  credentialRef: null,
}

const bindings: RouteBinding[] = [{ path: '/smoke-test', curi: 'smoke-test' }]

const runtime: GatewayRuntime = {
  async getCredential() {
    return null
  },
  async invalidateCredential() {},
  recordEvent() {},
}

describe('createGatewayRouter (package smoke test)', () => {
  it('404s for a path with no matching route binding', async () => {
    const router = createGatewayRouter({ resolveConfig: async () => null, resolveRoute: createStaticRouteResolver([]), runtime })
    const response = await router.fetch(new Request('http://localhost/does-not-exist'))
    assert.equal(response.status, 404)
  })

  it('500s for a known curi whose source type has no registered client', async () => {
    const router = createGatewayRouter({
      resolveConfig: async (curi) => (curi === 'smoke-test' ? config : null),
      resolveRoute: createStaticRouteResolver(bindings),
      runtime,
    })
    const response = await router.fetch(new Request('http://localhost/smoke-test'))
    assert.equal(response.status, 500)
  })

  it('answers a CORS preflight without ever calling resolveConfig at all', async () => {
    let called = false
    const router = createGatewayRouter({
      resolveConfig: async () => {
        called = true
        return null
      },
      resolveRoute: createStaticRouteResolver(bindings),
      runtime,
    })
    const response = await router.fetch(new Request('http://localhost/smoke-test', { method: 'OPTIONS' }))
    assert.equal(response.status, 204)
    assert.ok(!called, 'a preflight must be answered before any config lookup')
  })

  it('answers the Gateway-global readyz without any route binding at all', async () => {
    const router = createGatewayRouter({ resolveConfig: async () => null, resolveRoute: createStaticRouteResolver([]), runtime })
    const response = await router.fetch(new Request('http://localhost/.conduits/readyz'))
    assert.equal(response.status, 204)
  })

  it('routes an item path (/<curi>/<id>) through the same pipeline as the bare path', async () => {
    const router = createGatewayRouter({
      resolveConfig: async (curi) => (curi === 'smoke-test' ? config : null),
      resolveRoute: createStaticRouteResolver(bindings),
      runtime,
    })
    // Reaching the same "unsupported source" 500 bare GET hits proves
    // item-path resolution correctly reached loadConduitTable too, not
    // just that the path itself matched something.
    const response = await router.fetch(new Request('http://localhost/smoke-test/42'))
    assert.equal(response.status, 500)
  })

  it('405s a method this conduit-path shape never supports', async () => {
    const router = createGatewayRouter({
      resolveConfig: async (curi) => (curi === 'smoke-test' ? config : null),
      resolveRoute: createStaticRouteResolver(bindings),
      runtime,
    })
    const response = await router.fetch(new Request('http://localhost/smoke-test', { method: 'HEAD' }))
    assert.equal(response.status, 405)
    assert.ok(response.headers.get('Allow'))
  })

  it('404s an unrecognized path under the reserved .conduits segment, never treating it as an item id', async () => {
    const router = createGatewayRouter({
      resolveConfig: async (curi) => (curi === 'smoke-test' ? config : null),
      resolveRoute: createStaticRouteResolver(bindings),
      runtime,
    })
    const response = await router.fetch(new Request('http://localhost/smoke-test/.conduits/unknown'))
    assert.equal(response.status, 404)
  })
})
