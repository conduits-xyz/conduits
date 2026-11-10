import { createGatewayRouter } from '../router.ts'
import type { ConduitConfig, GatewayRuntime } from '../types.ts'
import type { GatewayDeps } from '../pipeline.ts'
import { testDeps } from './test-deps.ts'
import { testConduitConfig } from '../testing.ts'
import { createStaticRouteResolver, type RouteBinding } from '../route-binding.ts'

// The runtime a fake gateway's routers use unless given another: every
// conduit has a credential. A test extends it, for example with
// recordObservation.
export const fakeRuntime: GatewayRuntime = {
  async getCredential() {
    return 'fake-credential'
  },
  async invalidateCredential() {},
}

// A test harness: createGatewayRouter over a plain ConduitConfig, an
// in-memory Google Sheets (`sheets`) and a clock the test moves
// (`clock.advance`), with no database, files or network, for one
// conduit: `prefix` and a random part, or `curi` when two gateways must
// serve the same conduit. Every router it makes shares the one set of
// dependencies.
export function createFakeGateway(prefix: string, curi = `${prefix}-${Math.random().toString(36).slice(2)}`) {
  const { sheets, ...shared } = testDeps()
  const suriObjectKey = `${curi}-sheet`
  const bindings: RouteBinding[] = [{ path: `/${curi}`, curi }]

  const baseConfig = (overrides: Partial<ConduitConfig> = {}) =>
    testConduitConfig({ curi, racm: ['GET', 'POST'], suriObjectKey, credentialRef: null, ...overrides })

  // `deps` replaces any of the router's dependencies, for example
  // listLimits or sourceClients.
  function makeRouter(config: ConduitConfig, deps: Partial<GatewayDeps> = {}) {
    return createGatewayRouter({
      ...shared,
      resolveConfig: async (requested) => (requested === curi ? config : null),
      resolveRoute: createStaticRouteResolver(bindings),
      runtime: fakeRuntime,
      listLimits: { default: 1000, max: 1000 },
      ...deps,
    })
  }

  return { curi, suriObjectKey, sheets, clock: shared.clock, baseConfig, makeRouter }
}

// A conduit of its own on a fake gateway (createFakeGateway):
// its config is baseConfig with `overrides`, its router has `deps`.
// `send` requests a path below the conduit's route, and `json` sends a
// JSON body.
export function fakeConduit(prefix: string, overrides: Partial<ConduitConfig> = {}, deps: Partial<GatewayDeps> = {}) {
  const gateway = createFakeGateway(prefix)
  const { curi } = gateway
  const router = gateway.makeRouter(gateway.baseConfig(overrides), deps)
  const send = (path = '', init: RequestInit = {}) => router.fetch(new Request(`http://gateway.test/${curi}${path}`, init))
  const json = (method: string, path: string, body: unknown, headers: Record<string, string> = {}) =>
    send(path, { method, headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
  return { curi, gateway, send, json }
}
