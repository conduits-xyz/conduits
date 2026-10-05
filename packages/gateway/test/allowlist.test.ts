import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { createGatewayRouter } from '../router.ts'
import type { ConduitConfig, GatewayRuntime } from '../types.ts'
import { testDeps } from './test-deps.ts'
import { createStaticRouteResolver } from '../route-binding.ts'

const config: ConduitConfig = {
  curi: 'allowlisted',
  allowlist: [{ ip: '203.0.113.9', comment: 'office', status: 'active' }],
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

const runtime: GatewayRuntime = {
  async getCredential() {
    return null
  },
  async invalidateCredential() {},
}

const router = createGatewayRouter({ ...testDeps(),
  resolveConfig: async (curi) => (curi === 'allowlisted' ? config : null),
  resolveRoute: createStaticRouteResolver([{ path: '/allowlisted', curi: 'allowlisted' }]),
  runtime,
  listLimits: { default: 1000, max: 1000 },
})

function get(forwardedFor?: string): Promise<Response> {
  return router.fetch(new Request('http://localhost/allowlisted', forwardedFor ? { headers: { 'x-forwarded-for': forwardedFor } } : {}))
}

describe('IP allowlist', () => {
  it('lets through the address the proxy reports (past the allowlist; the fake source then 500s)', async () => {
    assert.notEqual((await get('203.0.113.9')).status, 403)
  })

  it('uses the rightmost X-Forwarded-For entry: a forged entry in front of the real one does not pass', async () => {
    // The caller sent "203.0.113.9"; the proxy appended the real address.
    assert.equal((await get('203.0.113.9, 198.51.100.7')).status, 403)
  })

  it('passes when the proxy appended the allowlisted address after a caller-supplied one', async () => {
    assert.notEqual((await get('10.9.9.9, 203.0.113.9')).status, 403)
  })

  it('refuses a request with no X-Forwarded-For at all', async () => {
    assert.equal((await get()).status, 403)
  })
})
