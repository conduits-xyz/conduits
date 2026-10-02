import type { Middleware } from 'remix/router'

import type { GatewayContext } from './context.ts'

// Rejects a pending middleware or handler promise as soon as the request
// is aborted (the client disconnected), as remix/router does.
function raceRequestAbort<T>(promise: Promise<T>, request: Request): Promise<T> {
  const signal = request.signal
  if (signal.aborted) throw signal.reason

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

// Runs middleware as remix/router does, whose runner isn't public:
// a returned Response ends the chain, otherwise `next()` must be called
// exactly once, and an abort rejects. dispatch.ts needs it because it
// doesn't register routes per shape.
// `Middleware<any>`: createGatewayMiddleware()'s array mixes middleware
// with different context-transform types, which TypeScript can't unify.
export function runMiddleware(
  middleware: readonly Middleware<any>[],
  context: GatewayContext,
  handler: (context: GatewayContext) => Response | Promise<Response>,
): Promise<Response> {
  let index = -1

  async function dispatch(i: number): Promise<Response> {
    if (i <= index) throw new Error('next() called multiple times')
    index = i

    const fn = middleware[i]
    if (!fn) return raceRequestAbort(Promise.resolve(handler(context)), context.request)

    let nextPromise: Promise<Response> | undefined
    const next = () => {
      nextPromise = dispatch(i + 1)
      return nextPromise
    }

    // Cast to the generic RequestContext<any>, as remix/router passes an
    // untyped context; there is no runtime difference.
    const response = await raceRequestAbort(Promise.resolve(fn(context as any, next)), context.request)
    if (response instanceof Response) return response
    if (nextPromise !== undefined) return nextPromise
    throw new Error('Middleware must return a Response or call next()')
  }

  return dispatch(0)
}
