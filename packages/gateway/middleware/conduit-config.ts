import { createContextKey, type Middleware } from 'remix/router'

import { problemResponse } from '../response.ts'
import type { ConduitConfig } from '../types.ts'

export const conduitConfigContext = createContextKey<ConduitConfig>()

// "Not Found" whether the curi resolves to nothing or to an inactive
// conduit; resolveConfig() decides, and returns a config or nothing.
export function resolveConduitConfig(
  resolveConfig: (curi: string) => Promise<ConduitConfig | null>,
): Middleware<{ key: typeof conduitConfigContext; value: ConduitConfig }> {
  return async (context, next) => {
    const config = await resolveConfig(context.params.curi)
    if (!config) return problemResponse('not_found')

    context.set(conduitConfigContext, config)
    return next()
  }
}
