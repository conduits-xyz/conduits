import type { GatewayContext } from './context.ts'
import type { GatewayDeps } from './pipeline.ts'
import { createGatewayMiddleware, createSchemaGatewayMiddleware, createReadyzGatewayMiddleware } from './pipeline.ts'
import { runMiddleware } from './run-middleware.ts'
import { classifyConduitAction } from './route-binding.ts'
import { createGatewayActions } from './controller.ts'
import { createGatewayItemActions } from './item-controller.ts'
import { gatewaySchemaAction } from './schema-controller.ts'
import { gatewayReadyzAction } from './readyz-controller.ts'
import { problemResponse } from './response.ts'
import { finishResponse, requestIdContext } from './middleware/request-id.ts'
import { conduitConfigContext } from './middleware/conduit-config.ts'
import { providerBytesContext, honeypotDropCountContext, apiKeyIdContext, classifyStatus, type RouteKind, type GatewayObservation } from './observation.ts'

// Answers CORS preflight without looking up the conduit: every standard
// method is allowed, and a method RACM forbids gets a JSON 405 with an
// Allow header on the real request. The same for every conduit path.
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
  return problemResponse('method_not_allowed', { headers: { Allow: allowed.join(', ') } })
}

// Resolves a request to a conduit as docs/data-model.md "route binding"
// describes: request -> route binding -> curi -> ConduitConfig. Bindings
// come from configuration at run time, so remix's compile-time route
// patterns can't express them; this resolves (host, path) to a curi
// itself, then runs the middleware and actions in controller.ts,
// item-controller.ts, schema-controller.ts and readyz-controller.ts.
export function createGatewayDispatcher(deps: GatewayDeps): (context: GatewayContext) => Promise<Response> {
  const gatewayMiddleware = createGatewayMiddleware(deps)
  const schemaMiddleware = createSchemaGatewayMiddleware(deps)
  const readyzMiddleware = createReadyzGatewayMiddleware(deps)

  const actions = createGatewayActions(deps)
  const itemActions = createGatewayItemActions()

  // `routeKind` is a one-element box set as routing proceeds; it stays
  // 'unmatched' when no binding resolves, and then there is no curi.
  async function route(context: GatewayContext, routeKind: { current: RouteKind }): Promise<Response> {
    const match = await deps.resolveRoute(context.url.hostname, context.url.pathname)
    if (!match) return problemResponse('not_found')

    const action = classifyConduitAction(match.suffix)
    if (!action) return problemResponse('not_found')

    context.params.curi = match.binding.curi
    routeKind.current = action.kind

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

  return async function dispatch(context: GatewayContext): Promise<Response> {
    const start = Date.now()
    const routeKind = { current: 'unmatched' as RouteKind }
    let response: Response
    try {
      response = await route(context, routeKind)
    } catch (err) {
      // The same 500 as the hosts' last-resort fallback, caught here so
      // the request still gets its id and is still observed.
      console.error(err)
      response = problemResponse('internal_error')
    }
    response = await finishResponse(response, context.get(requestIdContext))

    // Without recordObservation, skip all measurement.
    if (!deps.runtime.recordObservation) return response

    const config = context.get(conduitConfigContext)
    const providerBytes = context.get(providerBytesContext)
    const clientRequestBytes = Number(context.headers.get('content-length')) || 0
    const clientResponseBytes = Number(response.headers.get('content-length')) || 0

    const observation: GatewayObservation = {
      timestamp: new Date(start).toISOString(),
      latencyMs: Date.now() - start,
      curi: context.params.curi || undefined,
      apiKeyId: context.get(apiKeyIdContext),
      routeKind: routeKind.current,
      host: context.url.hostname || undefined,
      method: context.method,
      status: response.status,
      statusClass: classifyStatus(response.status),
      clientRequestBytes,
      clientResponseBytes,
      providerRequestBytes: providerBytes?.providerRequestBytes ?? 0,
      providerResponseBytes: providerBytes?.providerResponseBytes ?? 0,
      providerAttempted: providerBytes?.providerAttempted ?? false,
      honeypotDropCount: context.get(honeypotDropCountContext) ?? 0,
      suriType: config?.suriType,
    }

    try {
      await deps.runtime.recordObservation(observation)
    } catch (err) {
      // Logged only; see GatewayRuntime.recordObservation.
      console.error('[gateway] recordObservation failed:', err)
    }

    return response
  }
}
