import type { Middleware } from 'remix/router'

// Conduits are called from web components on other sites (see
// library/widgets/), so cross-origin requests need this and the OPTIONS
// preflight handling in dispatch.ts.
//
// Applied on the router (router.ts), so every response gets it,
// including 404 and 405 fallbacks.
export function addCorsHeaders(): Middleware {
  return async (_context, next) => {
    const response = await next()
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    // So browser code can read them; neither is CORS-safelisted.
    headers.set('Access-Control-Expose-Headers', 'Request-Id, Retry-After')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}
