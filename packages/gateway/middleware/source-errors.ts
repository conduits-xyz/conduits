import type { Middleware } from 'remix/router'

import { ConduitAuthError, ConduitSourceError, ConduitUnknownFieldError } from '@conduits/conduit'
import type { GatewayRuntime } from '../types.ts'
import { jsonResponse } from '../response.ts'
import { conduitConfigContext } from './conduit-config.ts'

// Wraps the action and loadConduitTable's connect() and open(). Turns
// ConduitAuthError, ConduitSourceError and ConduitUnknownFieldError into
// JSON responses; other errors pass through.
export function handleSourceErrors(runtime: GatewayRuntime): Middleware {
  return async (context, next) => {
    try {
      return await next()
    } catch (err) {
      if (err instanceof ConduitUnknownFieldError) {
        return jsonResponse({ error: err.message }, 400)
      }

      if (err instanceof ConduitAuthError) {
        // The credential was rejected: let the runtime clean it up so the
        // next request fails without calling the source. What that means
        // per suriType is the runtime's choice (a no-op for Fastmail).
        const config = context.get(conduitConfigContext)
        if (config) await runtime.invalidateCredential(config)
        return jsonResponse({ error: 'Service Unavailable' }, 502)
      }

      if (err instanceof ConduitSourceError) {
        // Another non-2xx (a deleted table, a 5xx); logged.
        console.error(`${err.source} request failed (${err.status}): ${err.message}`)
        return jsonResponse({ error: 'Service Unavailable' }, 502)
      }

      throw err
    }
  }
}
