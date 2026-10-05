import { createContextKey, type Middleware } from 'remix/router'
import { sourceClients, type ConduitSourceClient, type ConduitTable } from '@conduits/conduit'

import { problemResponse } from '../response.ts'
import type { GatewayRuntime } from '../types.ts'
import { providerBytesContext } from '../observation.ts'
import { conduitConfigContext } from './conduit-config.ts'

export const conduitTableContext = createContextKey<ConduitTable>()

// Opens the source for the config's suriType (integrations are
// registered in `sourceClients` in packages/conduit): gets the
// credential from runtime.getCredential(), connects and opens once per
// request, and disconnects when the request is done.
export function loadConduitTable(
  runtime: GatewayRuntime,
  overrides: Record<string, ConduitSourceClient> = {},
): Middleware<{ key: typeof conduitTableContext; value: ConduitTable }> {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('loadConduitTable() requires resolveConduitConfig() middleware to run first')

    const client = overrides[config.suriType] ?? sourceClients[config.suriType]
    if (!client) {
      return problemResponse('internal_error', { detail: `Unsupported source: '${config.suriType}'` })
    }

    const credential = await runtime.getCredential(config)
    if (!credential) return problemResponse('source_unavailable', { detail: 'The conduit has no usable credential.' })

    // Undefined without instrumentFetch; connect() then uses the global
    // fetch.
    const instrumentation = runtime.instrumentFetch?.()
    const source = await client.connect(config.suriObjectKey, credential, instrumentation?.fetchImpl)
    try {
      context.set(conduitTableContext, source.open(JSON.stringify(config.suriConfig)))
      return await next()
    } finally {
      // A failed disconnect doesn't turn a decided response into an
      // error (INTEGRATIONS.md).
      try {
        await client.disconnect(source)
      } catch (err) {
        console.error(`${config.suriType} disconnect failed:`, err)
      }
      // Read by dispatch() after the pipeline completes (observation.ts).
      if (instrumentation) context.set(providerBytesContext, instrumentation.finish())
    }
  }
}
