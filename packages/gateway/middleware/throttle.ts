import type { Middleware } from 'remix/router'

import { jsonResponse } from '../response.ts'
import { conduitConfigContext } from './conduit-config.ts'

// In-memory, single-process token bucket per curi: 5 requests/second.
// Won't survive a restart or scale past one process.
const WINDOW_MS = 1000
const MAX_PER_WINDOW = 5

const hits = new Map<string, number[]>()

export function enforceThrottle(): Middleware {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('enforceThrottle() requires resolveConduitConfig() middleware to run first')

    if (!config.throttle) return next()

    const now = Date.now()
    const windowStart = now - WINDOW_MS
    const timestamps = (hits.get(config.curi) ?? []).filter((t) => t > windowStart)

    if (timestamps.length >= MAX_PER_WINDOW) {
      return jsonResponse({ error: 'Too Many Requests' }, 429, { 'Retry-After': '1' })
    }

    timestamps.push(now)
    hits.set(config.curi, timestamps)
    return next()
  }
}

/** Test-only: clear throttle state between tests. */
export function resetThrottle(): void {
  hits.clear()
}
