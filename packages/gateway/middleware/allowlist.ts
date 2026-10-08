import type { Middleware } from 'remix/router'

import { problemResponse } from '../response.ts'
import { clientIpContext } from './client-ip.ts'
import { conduitConfigContext } from './conduit-config.ts'

export function enforceAllowlist(): Middleware {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('enforceAllowlist() requires resolveConduitConfig() middleware to run first')

    const active = config.allowlist.filter((entry) => entry.status === 'active')
    if (active.length === 0) return next()

    const ip = context.get(clientIpContext)
    if (ip == null || !active.some((entry) => entry.ip === ip)) {
      return problemResponse('forbidden')
    }
    return next()
  }
}
