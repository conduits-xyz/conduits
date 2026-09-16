import type { Middleware, RequestContext } from 'remix/router'

import { jsonResponse } from '../response.ts'
import { conduitConfigContext } from './conduit-config.ts'

// The app sits behind a reverse proxy, so the real client address is only
// ever available via X-Forwarded-For, not the raw socket.
function clientIp(context: RequestContext<any, any>): string | null {
  const forwardedFor = context.headers.get('x-forwarded-for')
  if (!forwardedFor) return null
  return forwardedFor.split(',')[0]?.trim() || null
}

export function enforceAllowlist(): Middleware {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('enforceAllowlist() requires resolveConduitConfig() middleware to run first')

    const active = config.allowlist.filter((entry) => entry.status === 'active')
    if (active.length === 0) return next()

    const ip = clientIp(context)
    if (ip == null || !active.some((entry) => entry.ip === ip)) {
      return jsonResponse({ error: 'Forbidden' }, 403)
    }
    return next()
  }
}
