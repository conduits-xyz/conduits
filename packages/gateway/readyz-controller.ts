import { createController } from 'remix/router'

import { gatewayRoutes } from './routes.ts'
import type { GatewayContext } from './context.ts'
import { createReadyzGatewayMiddleware, type GatewayDeps } from './pipeline.ts'

// Its own controller with its own middleware pipeline
// (createReadyzGatewayMiddleware, not createGatewayMiddleware) — see that
// pipeline's own comment for what this route does and doesn't check.
export function createGatewayReadyzController(deps: Pick<GatewayDeps, 'resolveConfig'>) {
  return createController<typeof gatewayRoutes.readyz, GatewayContext, ReturnType<typeof createReadyzGatewayMiddleware>>(
    gatewayRoutes.readyz,
    {
      middleware: createReadyzGatewayMiddleware(deps),
      actions: {
        read() {
          return new Response(null, { status: 204 })
        },
      },
    },
  )
}
