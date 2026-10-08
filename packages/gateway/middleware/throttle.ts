import type { Middleware } from 'remix/router'

import type { GatewayClock } from '../pipeline.ts'
import { problemResponse } from '../response.ts'
import { clientIpContext } from './client-ip.ts'
import { conduitConfigContext } from './conduit-config.ts'

// How many requests one client address may make to one conduit. Counted
// in fixed windows of `windowMs`. A request without X-Forwarded-For is
// counted against the conduit alone.
export interface ThrottleLimits {
  // More requests than this in one window are refused with 429.
  requests: number
  windowMs: number
  // An address that makes this many requests in one window, refused ones
  // included, is refused for `banMs`. Greater than `requests`.
  banAfter: number
  banMs: number
}

// Where the throttle keeps its counts and bans, by key. Times are wall
// clock milliseconds, so gateway processes sharing one store agree on
// the windows.
export interface ThrottleStore {
  // Adds one to the key's count for the window that starts at
  // `windowStartMs`, and returns the new count. A window's count is not
  // read after `windowStartMs + windowMs`.
  increment(key: string, windowStartMs: number, windowMs: number): Promise<number>
  // When the key's ban ends, or null when it isn't banned at `nowMs`.
  bannedUntil(key: string, nowMs: number): Promise<number | null>
  ban(key: string, untilMs: number): Promise<void>
}

export interface Throttle {
  limits: ThrottleLimits
  store: ThrottleStore
}

// A ThrottleStore in this process's memory: it doesn't survive a restart
// or span processes. Ended windows and bans are dropped once per window.
export function createMemoryThrottleStore(): ThrottleStore {
  const counts = new Map<string, { windowStartMs: number; endMs: number; count: number }>()
  const bans = new Map<string, number>()
  let sweptWindowStartMs = -Infinity

  return {
    async increment(key, windowStartMs, windowMs) {
      if (windowStartMs > sweptWindowStartMs) {
        sweptWindowStartMs = windowStartMs
        for (const [k, entry] of counts) if (entry.endMs <= windowStartMs) counts.delete(k)
        for (const [k, untilMs] of bans) if (untilMs <= windowStartMs) bans.delete(k)
      }
      let entry = counts.get(key)
      if (!entry || entry.windowStartMs !== windowStartMs) {
        entry = { windowStartMs, endMs: windowStartMs + windowMs, count: 0 }
        counts.set(key, entry)
      }
      return ++entry.count
    },
    async bannedUntil(key, nowMs) {
      const untilMs = bans.get(key)
      return untilMs !== undefined && untilMs > nowMs ? untilMs : null
    },
    async ban(key, untilMs) {
      bans.set(key, untilMs)
    },
  }
}

const BANNED = 'This address sent too many requests and is refused for a while.'

export function enforceThrottle({ limits, store }: Throttle, clock: GatewayClock): Middleware {
  const refuse = (detail: string, waitMs: number) => problemResponse('rate_limited', { detail, retryAfter: Math.max(1, Math.ceil(waitMs / 1000)) })

  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('enforceThrottle() requires resolveConduitConfig() middleware to run first')

    const ip = context.get(clientIpContext)
    const key = ip === null ? config.curi : `${config.curi} ${ip}`
    const nowMs = clock.now().getTime()

    const bannedUntilMs = await store.bannedUntil(key, nowMs)
    if (bannedUntilMs !== null) return refuse(BANNED, bannedUntilMs - nowMs)

    const windowStartMs = nowMs - (nowMs % limits.windowMs)
    const count = await store.increment(key, windowStartMs, limits.windowMs)
    if (count >= limits.banAfter) {
      await store.ban(key, nowMs + limits.banMs)
      return refuse(BANNED, limits.banMs)
    }
    if (count > limits.requests) {
      return refuse(`This conduit allows ${limits.requests} requests from one address every ${limits.windowMs} ms.`, windowStartMs + limits.windowMs - nowMs)
    }
    return next()
  }
}
