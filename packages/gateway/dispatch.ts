import type { GatewayContext } from './context.ts'
import type { GatewayDeps } from './pipeline.ts'
import { createGatewayMiddleware, createSchemaGatewayMiddleware, createReadyzGatewayMiddleware } from './pipeline.ts'
import { runMiddleware } from './run-middleware.ts'
import { classifyConduitAction } from './route-binding.ts'
import { createGatewayActions } from './controller.ts'
import { createGatewayItemActions } from './item-controller.ts'
import { gatewaySchemaAction } from './schema-controller.ts'
import { gatewayReadyzAction } from './readyz-controller.ts'
import { jsonResponse } from './response.ts'

// Answers the browser's CORS preflight directly — no config lookup, no
// RACM check. Always allows every standard verb; if a conduit's own
// RACM forbids a method, the real request still reaches enforceRacm()
// and gets a normal, readable JSON 405 with an Allow header. Same
// response regardless of which conduit-path shape (bare/item/schema/
// readyz) the preflight is for.
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

function methodNotAllowed(allowed: readonly string[]): Response {
  return jsonResponse({ error: 'Method Not Allowed' }, 405, { Allow: allowed.join(', ') })
}

// Replaces the old static `route('api/:curi', {...})` tree (see
// git history) with data-driven resolution, per docs/data-model.md's
// "route binding": HTTP request -> route binding -> CURI ->
// ConduitConfig. Route bindings are configured per-deployment (self-
// hosted YAML, or a managed Gateway's projected snapshot) and can't be
// known at module-load time, so remix's own compile-time route
// patterns can't express this directly — this function does the
// (host, path) -> curi resolution itself, then runs the same
// middleware pipelines/action bodies (controller.ts, item-controller.ts,
// schema-controller.ts, readyz-controller.ts) completely unchanged.
export function createGatewayDispatcher(deps: GatewayDeps): (context: GatewayContext) => Promise<Response> {
  const gatewayMiddleware = createGatewayMiddleware(deps)
  const schemaMiddleware = createSchemaGatewayMiddleware(deps)
  const readyzMiddleware = createReadyzGatewayMiddleware(deps)

  const actions = createGatewayActions(deps)
  const itemActions = createGatewayItemActions()

  return async function dispatch(context: GatewayContext): Promise<Response> {
    const match = await deps.resolveRoute(context.url.hostname, context.url.pathname)
    if (!match) return jsonResponse({ error: 'Not Found' }, 404)

    const action = classifyConduitAction(match.suffix)
    if (!action) return jsonResponse({ error: 'Not Found' }, 404)

    context.params.curi = match.binding.curi

    if (context.method === 'OPTIONS') return answerPreflight()

    switch (action.kind) {
      case 'bare':
        switch (context.method) {
          case 'GET':
            return runMiddleware(gatewayMiddleware, context, actions.list)
          case 'POST':
            return runMiddleware(gatewayMiddleware, context, actions.write)
          case 'PATCH':
            return runMiddleware(gatewayMiddleware, context, actions.bulkUpdate)
          case 'PUT':
            return runMiddleware(gatewayMiddleware, context, actions.bulkReplace)
          case 'DELETE':
            return runMiddleware(gatewayMiddleware, context, actions.bulkDestroy)
          default:
            return methodNotAllowed(['GET', 'POST', 'PATCH', 'PUT', 'DELETE'])
        }

      case 'item':
        context.params.id = action.id
        switch (context.method) {
          case 'GET':
            return runMiddleware(gatewayMiddleware, context, itemActions.read)
          case 'PUT':
            return runMiddleware(gatewayMiddleware, context, itemActions.replace)
          case 'PATCH':
            return runMiddleware(gatewayMiddleware, context, itemActions.update)
          case 'DELETE':
            return runMiddleware(gatewayMiddleware, context, itemActions.destroy)
          default:
            return methodNotAllowed(['GET', 'PUT', 'PATCH', 'DELETE'])
        }

      case 'schema':
        if (context.method !== 'GET') return methodNotAllowed(['GET'])
        return runMiddleware(schemaMiddleware, context, gatewaySchemaAction)

      case 'readyz':
        if (context.method !== 'GET') return methodNotAllowed(['GET'])
        return runMiddleware(readyzMiddleware, context, gatewayReadyzAction)
    }
  }
}
