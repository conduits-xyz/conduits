import { createRouter } from 'remix/router'

import { gatewayRoutes } from './routes.ts'
import { parseJsonBody } from './middleware/body.ts'
import { addCorsHeaders } from './middleware/cors.ts'
import { createGatewayController } from './controller.ts'
import { createGatewaySchemaController } from './schema-controller.ts'
import { createGatewayReadyzController } from './readyz-controller.ts'
import { createGatewayItemController } from './item-controller.ts'
import type { GatewayDeps } from './pipeline.ts'

// Answers the browser's CORS preflight directly — no config lookup, no
// RACM check. Always allows every standard verb; if a conduit's own RACM
// forbids a method, the real request still reaches enforceRacm() and gets
// a normal, readable JSON 405 with an Allow header.
function answerPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  })
}

// A separate router from the host's own page router: RACM, allowlist, and
// throttle (./pipeline.ts) are this router's own access control,
// public-API-shaped rather than session-shaped — no session()/csrf()
// middleware here.
//
// Only param-independent middleware lives at the router level; route
// params (context.params.curi) aren't populated until the router has
// matched a specific route, so anything needing the resolved config
// (./pipeline.ts) is controller-level middleware instead, on every
// controller below.
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

  gatewayRouter.map(gatewayRoutes, createGatewayController(deps))
  gatewayRouter.map(gatewayRoutes.schema, createGatewaySchemaController(deps))
  gatewayRouter.map(gatewayRoutes.readyz, createGatewayReadyzController(deps))
  gatewayRouter.map(gatewayRoutes.item, createGatewayItemController(deps))

  // Registered directly on the router, not through gatewayRoutes/
  // createGatewayController, so a preflight is answered before any
  // per-action middleware runs. api/:curi/schema gets its own explicit
  // registration — it unconditionally requires an Authorization header,
  // which makes a cross-origin request "non-simple" under the Fetch/CORS
  // spec and triggers a real preflight, same as any other non-GET/
  // POST-with-plain-body call.
  gatewayRouter.options('api/:curi', answerPreflight)
  gatewayRouter.options('api/:curi/schema', answerPreflight)
  gatewayRouter.options('api/:curi/:id', answerPreflight)

  return gatewayRouter
}
