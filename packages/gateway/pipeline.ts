import { resolveConduitConfig } from './middleware/conduit-config.ts'
import { enforceRacm } from './middleware/racm.ts'
import { enforceAllowlist } from './middleware/allowlist.ts'
import { enforceBearerToken, requireBearerToken } from './middleware/bearer-token.ts'
import { enforceThrottle } from './middleware/throttle.ts'
import { trackHit } from './middleware/track-event.ts'
import { loadConduitTable } from './middleware/source-client.ts'
import { handleSourceErrors } from './middleware/source-errors.ts'
import type { RouteMatch } from './route-binding.ts'
import type { ConduitConfig, GatewayRuntime } from './types.ts'

// What every gateway route needs injected: how to resolve a request's
// curi into a ConduitConfig, how to resolve a live request's (host,
// pathname) into a route binding + suffix (see dispatch.ts) — a host
// with a small, precomputed RouteBinding[] (self-hosted YAML, a
// managed Gateway's local active-config cache) should implement this
// with route-binding.ts's createStaticRouteResolver rather than
// writing its own; a host whose conduit set is too large or dynamic to
// precompute (backed by a live database, say) implements it directly
// against its own store — and the runtime seam for everything else
// that touches state outside this package (credentials, metrics).
export interface GatewayDeps {
  resolveConfig: (curi: string) => Promise<ConduitConfig | null>
  resolveRoute: (host: string | undefined, pathname: string) => Promise<RouteMatch | null>
  runtime: GatewayRuntime
}

// Controller-level, not router-level: route params (context.params.curi)
// are only populated once the router has matched a specific route, so
// resolveConduitConfig() and everything downstream of it run at the
// controller level. Shared between controller.ts and item-controller.ts
// so both get the identical pipeline.
//
// Hidden-form-field enforcement isn't here — see
// middleware/hidden-form-field.ts's checkHiddenFormField(), called
// directly by each write action once per record instead.
export function createGatewayMiddleware(deps: GatewayDeps) {
  return [
    resolveConduitConfig(deps.resolveConfig),
    enforceAllowlist(),
    enforceRacm(),
    enforceBearerToken(),
    enforceThrottle(),
    trackHit(deps.runtime),
    handleSourceErrors(deps.runtime),
    loadConduitTable(deps.runtime),
  ] as const
}

// schema-controller.ts's own pipeline — requireBearerToken() runs in the
// same early slot enforceBearerToken() occupies above, unconditionally
// (schema access isn't gated by tokenRequiredMethods like the rest of the
// gateway's actions is).
export function createSchemaGatewayMiddleware(deps: GatewayDeps) {
  return [
    resolveConduitConfig(deps.resolveConfig),
    enforceAllowlist(),
    enforceRacm(),
    requireBearerToken(),
    enforceThrottle(),
    trackHit(deps.runtime),
    handleSourceErrors(deps.runtime),
    loadConduitTable(deps.runtime),
  ] as const
}

// readyz-controller.ts's own pipeline: allowlist and throttle apply; no
// RACM or bearer-token check, and no credential or table load.
export function createReadyzGatewayMiddleware(deps: Pick<GatewayDeps, 'resolveConfig'>) {
  return [resolveConduitConfig(deps.resolveConfig), enforceAllowlist(), enforceThrottle()] as const
}
