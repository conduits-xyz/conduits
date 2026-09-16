import type { Middleware } from 'remix/router'

import type { GatewayRuntime } from '../types.ts'
import { conduitConfigContext } from './conduit-config.ts'

// Only counts a request that already passed RACM/allowlist/throttle. A
// failure to record a hit must never fail the actual request — see
// GatewayRuntime.recordEvent's own contract.
export function trackHit(runtime: GatewayRuntime): Middleware {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('trackHit() requires resolveConduitConfig() middleware to run first')

    try {
      await runtime.recordEvent({ type: 'hit', curi: config.curi })
    } catch {
      // Best-effort — see above.
    }

    return next()
  }
}
