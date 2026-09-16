import type { Middleware } from 'remix/router'

import { jsonResponse } from '../response.ts'
import { conduitConfigContext } from './conduit-config.ts'

export function enforceRacm(): Middleware {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('enforceRacm() requires resolveConduitConfig() middleware to run first')

    if (!config.racm.includes(context.method)) {
      return jsonResponse({ error: 'Method Not Allowed' }, 405, { Allow: config.racm.join(', ') })
    }
    return next()
  }
}
