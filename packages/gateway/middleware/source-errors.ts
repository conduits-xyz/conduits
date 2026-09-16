import type { Middleware } from 'remix/router'

import { ConduitAuthError, ConduitSourceError, ConduitUnknownFieldError } from '@conduits/conduit'
import type { GatewayRuntime } from '../types.ts'
import { jsonResponse } from '../response.ts'
import { conduitConfigContext } from './conduit-config.ts'

// Wraps the action (and loadConduitTable()'s connect()/open(), which runs
// downstream of this in the pipeline). Translates the three
// ConduitAuthError/ConduitSourceError/ConduitUnknownFieldError types from
// packages/conduit/sheets.ts into JSON responses; any other thrown error
// passes through unchanged.
export function handleSourceErrors(runtime: GatewayRuntime): Middleware {
  return async (context, next) => {
    try {
      return await next()
    } catch (err) {
      if (err instanceof ConduitUnknownFieldError) {
        return jsonResponse({ error: err.message }, 400)
      }

      if (err instanceof ConduitAuthError) {
        // A revoked grant — tell the runtime to clean up the now-dead
        // credential so the next request fails fast instead of hitting
        // the source again with a token already known to be dead. This
        // package doesn't know or care which suriTypes have anything to
        // invalidate; that's the runtime's own call (e.g. Fastmail's
        // static API token has no refresh/revocation concept, so a
        // runtime's invalidateCredential() can simply be a no-op for it).
        const config = context.get(conduitConfigContext)
        if (config) await runtime.invalidateCredential(config)
        return jsonResponse({ error: 'Service Unavailable' }, 502)
      }

      if (err instanceof ConduitSourceError) {
        // Some other non-2xx from the source (a deleted/renamed table, a
        // transient 5xx) — logged server-side since it's unexpected.
        console.error(`${err.source} request failed (${err.status}): ${err.message}`)
        return jsonResponse({ error: 'Service Unavailable' }, 502)
      }

      throw err
    }
  }
}
