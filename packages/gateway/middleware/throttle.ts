import type { Middleware } from 'remix/router'

import type { GatewayClock } from '../pipeline.ts'
import { problemResponse } from '../response.ts'
import { conduitConfigContext } from './conduit-config.ts'

// A token bucket per curi: 5 requests each second. Its state belongs to
// one router (createGatewayDispatcher makes one), in one process: it
// doesn't survive a restart or span processes.
const WINDOW_MS = 1000
const MAX_PER_WINDOW = 5

export function enforceThrottle(clock: GatewayClock): Middleware {
  const hits = new Map<string, number[]>()
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('enforceThrottle() requires resolveConduitConfig() middleware to run first')

    if (!config.throttle) return next()

    const now = clock.monotonicMs()
    const windowStart = now - WINDOW_MS
    const timestamps = (hits.get(config.curi) ?? []).filter((t) => t > windowStart)

    if (timestamps.length >= MAX_PER_WINDOW) {
      return problemResponse('rate_limited', { detail: `This conduit allows ${MAX_PER_WINDOW} requests each second.`, retryAfter: WINDOW_MS / 1000 })
    }

    timestamps.push(now)
    hits.set(config.curi, timestamps)
    return next()
  }
}
