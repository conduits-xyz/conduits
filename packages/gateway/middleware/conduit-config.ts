import { createContextKey, type Middleware } from 'remix/router'

import { jsonResponse } from '../response.ts'
import type { ConduitConfig } from '../types.ts'

export const conduitConfigContext = createContextKey<ConduitConfig>()

// Same response ("Not Found") whether the curi doesn't resolve to
// anything or resolves to something inactive — resolveConfig() itself
// decides that (an app-side DB lookup today); this middleware only
// ever sees "a config" or "nothing".
export function resolveConduitConfig(
  resolveConfig: (curi: string) => Promise<ConduitConfig | null>,
): Middleware<{ key: typeof conduitConfigContext; value: ConduitConfig }> {
  return async (context, next) => {
    const config = await resolveConfig(context.params.curi)
    if (!config) return jsonResponse({ error: 'Not Found' }, 404)

    context.set(conduitConfigContext, config)
    return next()
  }
}
