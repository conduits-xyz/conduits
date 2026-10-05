import { createRouter } from 'remix/router'

import { parseJsonBody } from './middleware/body.ts'
import { addCorsHeaders } from './middleware/cors.ts'
import { addRequestId } from './middleware/request-id.ts'
import { createGatewayDispatcher } from './dispatch.ts'
import { globalReadyzAction } from './global-readyz.ts'
import type { GatewayContext } from './context.ts'
import type { GatewayDeps } from './pipeline.ts'

// The gateway's own router, separate from any page router: access is
// controlled by RACM, allowlist and throttle (pipeline.ts), not sessions
// or CSRF.
//
// A factory: everything that touches a database or credentials comes in
// `deps` from the GatewayRuntime (e.g. services/gateway/runtime.ts).
export function createGatewayRouter(deps: GatewayDeps) {
  const gatewayRouter = createRouter({
    middleware: [addCorsHeaders(), addRequestId(deps.requestId), parseJsonBody()],
  })

  // Checked before any conduit lookup (global-readyz.ts). A literal
  // pattern, which remix ranks above the catch-all below.
  gatewayRouter.get('.conduits/readyz', globalReadyzAction)

  // Everything else: dispatch.ts resolves (host, path) to a conduit
  // itself, since bindings are configured at run time. It reads
  // context.url and sets context.params.curi and id (context.ts);
  // `conduitPath` is unused, hence the cast.
  const dispatch = createGatewayDispatcher(deps)
  gatewayRouter.route('ANY', '*conduitPath', (context) => dispatch(context as unknown as GatewayContext))

  return gatewayRouter
}
