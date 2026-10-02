import { createRouter, type RouterContext, type ContextWithParams } from 'remix/router'

import { addCorsHeaders } from './middleware/cors.ts'
import { parseJsonBody } from './middleware/body.ts'

// Used for its type: the context the router-level middleware (CORS and
// body parsing) produces, which actions use with context.get(). The
// serving router is built in router.ts.
const gatewayContextShape = createRouter({ middleware: [addCorsHeaders(), parseJsonBody()] })

// Set by dispatch.ts on context.params before calling an action; there
// are no `:curi` or `:id` route patterns.
export type GatewayContext = ContextWithParams<RouterContext<typeof gatewayContextShape>, { curi: string; id: string }>
