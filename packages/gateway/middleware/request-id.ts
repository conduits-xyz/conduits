import { createContextKey, type Middleware } from 'remix/router'

import { randomBase31 } from '../random.ts'

export const requestIdContext = createContextKey<string>('')

// Gives each request an id (GatewayDeps.requestId): the Request-Id
// header on every response, and `instance` (`urn:request:<id>`) on a
// problem (docs/gateway-api.md, "Errors").
// dispatch.ts finishes its own responses first, so its byte counts
// include these; this finishes the rest (body errors, the global
// readyz, router fallbacks).
// GatewayDeps.requestId's default: 20 symbols, about 99 bits.
export const generateRequestId = () => randomBase31(20)

export function addRequestId(makeId: () => string): Middleware {
  return async (context, next) => {
    const id = makeId()
    context.set(requestIdContext, id)
    const response = await next()
    return response.headers.has('Request-Id') ? response : finishResponse(response, id)
  }
}

export async function finishResponse(response: Response, id: string): Promise<Response> {
  const headers = new Headers(response.headers)
  headers.set('Request-Id', id)
  if (headers.get('content-type') !== 'application/problem+json') {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
  const problem = (await response.json()) as Record<string, unknown>
  const text = JSON.stringify({ ...problem, instance: `urn:request:${id}` })
  headers.set('content-length', String(new TextEncoder().encode(text).length))
  return new Response(text, { status: response.status, statusText: response.statusText, headers })
}
