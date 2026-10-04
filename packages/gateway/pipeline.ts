import type { ConduitSourceClient } from '@conduits/conduit'
import { resolveConduitConfig } from './middleware/conduit-config.ts'
import { enforceRacm } from './middleware/racm.ts'
import { enforceAllowlist } from './middleware/allowlist.ts'
import { enforceBearerToken, requireBearerToken } from './middleware/bearer-token.ts'
import { enforceThrottle } from './middleware/throttle.ts'
import { loadConduitTable } from './middleware/source-client.ts'
import { handleSourceErrors } from './middleware/source-errors.ts'
import type { RouteMatch } from './route-binding.ts'
import type { ConduitConfig, GatewayRuntime } from './types.ts'

// What the gateway routes need from the host: resolving a curi to a
// ConduitConfig, resolving a request's (host, pathname) to a route
// binding and suffix (dispatch.ts; createStaticRouteResolver covers a
// fixed list), and the runtime for credentials and metrics.
export interface GatewayDeps {
  resolveConfig: (curi: string) => Promise<ConduitConfig | null>
  resolveRoute: (host: string | undefined, pathname: string) => Promise<RouteMatch | null>
  runtime: GatewayRuntime
  // Rows a list read returns when it gives no `limit`, and the largest
  // `limit` it may give. Set by the caller; the package has no default.
  listLimits: { default: number; max: number }
  // Source clients by suriType, replacing the package's registry
  // (`sourceClients`) for the types given, for example a Sheets client
  // with a read cache and budget (createGoogleSheetsClient).
  sourceClients?: Record<string, ConduitSourceClient>
}

// Runs per action rather than on the router, since context.params.curi
// is set only after a route matches. Shared by controller.ts and
// item-controller.ts. Hidden form fields are checked per record by the
// write actions (checkHiddenFormField).
export function createGatewayMiddleware(deps: GatewayDeps) {
  return [
    resolveConduitConfig(deps.resolveConfig),
    enforceAllowlist(),
    enforceRacm(),
    enforceBearerToken(),
    enforceThrottle(),
    handleSourceErrors(deps.runtime),
    loadConduitTable(deps.runtime, deps.sourceClients),
  ] as const
}

// For schema-controller.ts: requireBearerToken() takes
// enforceBearerToken()'s place and always applies, whatever
// tokenRequiredMethods says.
export function createSchemaGatewayMiddleware(deps: GatewayDeps) {
  return [
    resolveConduitConfig(deps.resolveConfig),
    enforceAllowlist(),
    enforceRacm(),
    requireBearerToken(),
    enforceThrottle(),
    handleSourceErrors(deps.runtime),
    loadConduitTable(deps.runtime),
  ] as const
}

// For readyz-controller.ts: allowlist and throttle only; no RACM, token,
// credential or table.
export function createReadyzGatewayMiddleware(deps: Pick<GatewayDeps, 'resolveConfig'>) {
  return [resolveConduitConfig(deps.resolveConfig), enforceAllowlist(), enforceThrottle()] as const
}
