import { createRouter } from 'remix/router'

import { parseJsonBody } from './middleware/body.ts'
import { addCorsHeaders } from './middleware/cors.ts'
import { createGatewayDispatcher } from './dispatch.ts'
import { globalReadyzAction } from './global-readyz.ts'
import type { GatewayContext } from './context.ts'
import type { GatewayDeps } from './pipeline.ts'

// A separate router from the host's own page router: RACM, allowlist, and
// throttle (./pipeline.ts) are this router's own access control,
// public-API-shaped rather than session-shaped — no session()/csrf()
// middleware here.
//
// A factory, not a module-level singleton: every DB-touching or
// credential-touching seam is injected via `deps`, supplied by whichever
// `GatewayRuntime` resolved this call (this repo's own
// services/gateway/runtime.ts, or any other implementation) — this
// package itself never imports a database.
export function createGatewayRouter(deps: GatewayDeps) {
  const gatewayRouter = createRouter({
    middleware: [addCorsHeaders(), parseJsonBody()],
  })

  // Gateway-global, checked before any conduit resolution — see
  // global-readyz.ts. Registered as its own fully-literal pattern so it
  // always outranks the catch-all below (remix's route-pattern matcher
  // ranks a literal match more specific than a splat, regardless of
  // registration order).
  gatewayRouter.get('.conduits/readyz', globalReadyzAction)

  // Everything else: (host, path) -> route binding -> curi ->
  // ConduitConfig, resolved by hand rather than through remix's own
  // per-shape route patterns — see dispatch.ts for why a static pattern
  // tree can't express this (route bindings are configured per
  // deployment, unknown at module-load time). `conduitPath` itself is
  // never read — the dispatcher re-derives everything it needs from
  // context.url directly, and sets context.params.curi/id itself
  // (there's no static `:curi`/`:id` pattern left for remix to
  // populate them from — see context.ts), hence the cast: this route's
  // real, matched param is only ever `conduitPath`.
  const dispatch = createGatewayDispatcher(deps)
  gatewayRouter.route('ANY', '*conduitPath', (context) => dispatch(context as unknown as GatewayContext))

  return gatewayRouter
}
