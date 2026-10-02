import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createGatewayRouter } from '../router.ts'
import type { ConduitConfig, GatewayRuntime } from '../types.ts'
import { createStaticRouteResolver, type RouteBinding } from '../route-binding.ts'

// A smoke test of createGatewayRouter() alone: a ConduitConfig, a
// RouteBinding and a fake GatewayRuntime, with no database, files or
// network. services/gateway/test covers the behaviour in depth.

const config: ConduitConfig = {
  curi: 'smoke-test',
  allowlist: [],
  racm: ['GET'],
  throttle: false,
  tokenRequiredMethods: [],
  apiKeys: [],
  suriType: 'fake',
  suriObjectKey: 'unused',
  suriConfig: {},
  hiddenFormField: [],
  credentialRef: null,
}

const bindings: RouteBinding[] = [{ path: '/smoke-test', curi: 'smoke-test' }]

// No recordObservation or instrumentFetch, so dispatch() measures
// nothing.
const runtime: GatewayRuntime = {
  async getCredential() {
    return null
  },
  async invalidateCredential() {},
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
    // The same "unsupported source" 500 as the bare GET shows the item
    // path reached loadConduitTable.
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
