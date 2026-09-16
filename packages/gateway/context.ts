import { createRouter, type RouterContext } from 'remix/router'

import { addCorsHeaders } from './middleware/cors.ts'
import { parseJsonBody } from './middleware/body.ts'

// Purely for its type — every gateway route shares this same
// router-level middleware (CORS + body parsing), and each controller
// needs the resulting context type to type its own `context.get()`
// calls (jsonBodyContext, set here, not by any controller-level
// middleware). See router.ts's createGatewayRouter() for the real,
// request-serving router built from this same middleware array.
const gatewayContextShape = createRouter({ middleware: [addCorsHeaders(), parseJsonBody()] })

export type GatewayContext = RouterContext<typeof gatewayContextShape>
