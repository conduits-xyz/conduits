import { createGatewayRouter } from '../router.ts'
import type { ConduitConfig, GatewayRuntime } from '../types.ts'
import { createStaticRouteResolver, type RouteBinding } from '../route-binding.ts'

// Shared "plain ConduitConfig, real googleSheets fake client, no DB, no
// filesystem, no real network" test harness — used by any test file that
// needs a real createGatewayRouter to dispatch against, not just a unit
// under test in isolation.
export function createFakeGateway(curi: string) {
  const suriObjectKey = `${curi}-sheet`
  const bindings: RouteBinding[] = [{ path: `/${curi}`, curi }]
  const runtime: GatewayRuntime = {
    async getCredential() {
      return 'fake-credential'
    },
    async invalidateCredential() {},
  }

  function baseConfig(overrides: Partial<ConduitConfig> = {}): ConduitConfig {
    return {
      curi,
      allowlist: [],
      racm: ['GET', 'POST'],
      throttle: false,
      tokenRequiredMethods: [],
      bearerTokenHash: null,
      suriType: 'googleSheets',
      suriObjectKey,
      suriConfig: {},
      hiddenFormField: [],
      credentialRef: null,
      presentation: null,
      ...overrides,
    }
  }

  function makeRouter(config: ConduitConfig) {
    return createGatewayRouter({
      resolveConfig: async (requested) => (requested === curi ? config : null),
      resolveRoute: createStaticRouteResolver(bindings),
      runtime,
    })
  }

  return { suriObjectKey, baseConfig, makeRouter }
}
