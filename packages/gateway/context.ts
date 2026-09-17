import { createRouter, type RouterContext, type ContextWithParams } from 'remix/router'

import { addCorsHeaders } from './middleware/cors.ts'
import { parseJsonBody } from './middleware/body.ts'

// Purely for its type — every gateway route shares this same
// router-level middleware (CORS + body parsing), and every action
// needs the resulting context type to type its own `context.get()`
// calls (jsonBodyContext, set here, not by any action-level
// middleware). See router.ts's createGatewayRouter() for the real,
// request-serving router built from this same middleware array.
const gatewayContextShape = createRouter({ middleware: [addCorsHeaders(), parseJsonBody()] })

// `curi`/`id` aren't populated by remix's own route matching anymore —
// there's no static `:curi`/`:id` pattern left to infer them from (see
// dispatch.ts) — dispatch.ts sets both directly on `context.params`
// before calling an action, so this type just declares the same two
// keys every action has always been able to rely on.
export type GatewayContext = ContextWithParams<RouterContext<typeof gatewayContextShape>, { curi: string; id: string }>
