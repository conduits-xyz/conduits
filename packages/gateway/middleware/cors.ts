import type { Middleware } from 'remix/router'

// A conduit's public API is meant to be called directly from a
// framework-free web component embedded on someone else's page (see the
// widgets under library/widgets/). A cross-origin fetch() needs both
// this and the OPTIONS preflight handlers in router.ts.
//
// Applied at the router level (see router.ts), not inside jsonResponse():
// that covers every response this router produces, including its own
// 404/405 fallbacks.
export function addCorsHeaders(): Middleware {
  return async (context, next) => {
    const response = await next()
    const headers = new Headers(response.headers)
    headers.set('Access-Control-Allow-Origin', '*')
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  }
}
