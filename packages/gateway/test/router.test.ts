import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createGatewayRouter } from '../router.ts'
import type { ConduitConfig, GatewayRuntime } from '../types.ts'

// This package's own behavior is exercised in depth by every consumer's
// test suite (services/gateway/test/, here in this repo) rather than
// duplicated here — but the package
// itself, in isolation, still needs at least one real smoke test: this
// is the one place that proves createGatewayRouter() works end to end
// against nothing but a plain ConduitConfig and a fake GatewayRuntime,
// with zero DB, zero filesystem, zero real network.

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

const runtime: GatewayRuntime = {
  async getCredential() {
    return null
  },
  async invalidateCredential() {},
  recordEvent() {},
}

describe('createGatewayRouter (package smoke test)', () => {
  it('404s for an unknown curi', async () => {
    const router = createGatewayRouter({ resolveConfig: async () => null, runtime })
    const response = await router.fetch(new Request('http://localhost/api/does-not-exist'))
    assert.equal(response.status, 404)
  })

  it('500s for a known curi whose source type has no registered client', async () => {
    const router = createGatewayRouter({ resolveConfig: async (curi) => (curi === 'smoke-test' ? config : null), runtime })
    const response = await router.fetch(new Request('http://localhost/api/smoke-test'))
    assert.equal(response.status, 500)
  })

  it('answers a CORS preflight without ever calling resolveConfig at all', async () => {
    let called = false
    const router = createGatewayRouter({
      resolveConfig: async () => {
        called = true
        return null
      },
      runtime,
    })
    const response = await router.fetch(new Request('http://localhost/api/smoke-test', { method: 'OPTIONS' }))
    assert.equal(response.status, 204)
    assert.ok(!called, 'a preflight must be answered before any config lookup')
  })
})
