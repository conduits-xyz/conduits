import type { Middleware } from 'remix/router'

import type { GatewayContext } from './context.ts'

// Lets an aborted request (client disconnect) reject a pending
// middleware/handler promise immediately instead of waiting for it to
// finish on its own — same behavior remix/router's internal dispatcher
// gives every route it matches.
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

// remix/router's own middleware runner is internal (not part of its
// public API), and this package no longer registers per-shape routes
// through the router for it to run automatically (see dispatch.ts) —
// this reimplements the same onion-model composition (short-circuit on
// a returned Response, otherwise require `next()` to have been called
// exactly once, abort-raced the same way) so every existing Middleware
// in middleware/* keeps working completely unchanged.
// `Middleware<any>`, not the bare default `Middleware` (== `Middleware<
// readonly []>`) — createGatewayMiddleware()'s own array mixes several
// different context-transform types (one per context key a given
// middleware sets), each incompatible with the others at the type
// level even though none of that is ever checked at runtime.
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

    // `fn`'s declared context parameter is the generic `RequestContext<any>`
    // (entries defaulting to `[]`) every Middleware<transform> signature
    // uses, regardless of `transform` — remix's own internal dispatcher
    // passes a plain, untyped RequestContext through the same way rather
    // than a specifically-entried type like GatewayContext, so this cast
    // matches that, not a real runtime distinction.
    const response = await raceRequestAbort(Promise.resolve(fn(context as any, next)), context.request)
    if (response instanceof Response) return response
    if (nextPromise !== undefined) return nextPromise
    throw new Error('Middleware must return a Response or call next()')
  }

  return dispatch(0)
}
