import { createGatewayRouter } from '../router.ts'
import type { ConduitConfig, GatewayRuntime } from '../types.ts'
import type { GatewayDeps } from '../pipeline.ts'
import { createStaticRouteResolver, type RouteBinding } from '../route-binding.ts'

// A test harness: createGatewayRouter over a plain ConduitConfig and the
// fake googleSheets client, with no database, files or network.
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
      apiKeys: [],
      suriType: 'googleSheets',
      suriObjectKey,
      suriConfig: {},
      hiddenFormField: [],
      credentialRef: null,
      ...overrides,
    }
  }

  // `deps` replaces any of the router's dependencies, for example
  // listLimits or sourceClients.
  function makeRouter(config: ConduitConfig, deps: Partial<GatewayDeps> = {}) {
    return createGatewayRouter({
      resolveConfig: async (requested) => (requested === curi ? config : null),
      resolveRoute: createStaticRouteResolver(bindings),
      runtime,
      listLimits: { default: 1000, max: 1000 },
      ...deps,
    })
  }

  return { suriObjectKey, baseConfig, makeRouter }
}
