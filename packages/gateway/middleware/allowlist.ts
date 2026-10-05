import type { Middleware, RequestContext } from 'remix/router'

import { problemResponse } from '../response.ts'
import { conduitConfigContext } from './conduit-config.ts'

// The gateway runs behind one reverse proxy, so the client address comes
// from X-Forwarded-For, not the raw socket. The rightmost entry is the
// one that proxy wrote; anything to its left was sent by the caller and
// can be forged. Taking the rightmost is correct whether the proxy
// replaces the header or appends to it (see docs/gateway-api.md's
// allowlist section).
function clientIp(context: RequestContext<any, any>): string | null {
  const forwardedFor = context.headers.get('x-forwarded-for')
  if (!forwardedFor) return null
  const entries = forwardedFor.split(',').map((entry) => entry.trim()).filter(Boolean)
  return entries[entries.length - 1] ?? null
}

export function enforceAllowlist(): Middleware {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('enforceAllowlist() requires resolveConduitConfig() middleware to run first')

    const active = config.allowlist.filter((entry) => entry.status === 'active')
    if (active.length === 0) return next()

    const ip = clientIp(context)
    if (ip == null || !active.some((entry) => entry.ip === ip)) {
      return problemResponse('forbidden')
    }
    return next()
  }
}
