import { createContextKey, type Middleware } from 'remix/router'
import type { ConduitSource, ConduitSourceClient, ConduitTable } from '@conduits/conduit'

import { problemResponse } from '../response.ts'
import type { GatewayRuntime } from '../types.ts'
import { providerBytesContext } from '../observation.ts'
import { conduitConfigContext } from './conduit-config.ts'

// Opens the conduit's table on first call (openConduitTable in
// require-context.ts), at most once per request.
export const conduitTableContext = createContextKey<() => Promise<ConduitTable>>()

// The runtime had no usable credential for the conduit
// (handleSourceErrors answers 502).
export class NoUsableCredentialError extends Error {
  constructor() {
    super('The conduit has no usable credential.')
  }
}

// Lets an action open the source for the config's suriType, with the
// client the host gave for it (GatewayDeps.sourceClients). The source
// is opened only when the action first asks for its table, so a request
// the action refuses or drops first (an invalid body, a tripped
// honeypot) never fetches the credential, calls the provider or counts
// as provider traffic. Opening gets the credential from
// runtime.getCredential(), connects and opens; the source is
// disconnected when the request is done.
export function loadConduitTable(
  runtime: GatewayRuntime,
  sourceClients: Record<string, ConduitSourceClient>,
): Middleware<{ key: typeof conduitTableContext; value: () => Promise<ConduitTable> }> {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('loadConduitTable() requires resolveConduitConfig() middleware to run first')

    const client = sourceClients[config.suriType]
    if (!client) {
      return problemResponse('internal_error', { detail: `Unsupported source: '${config.suriType}'` })
    }

    let source: ConduitSource | null = null
    let instrumentation: ReturnType<NonNullable<GatewayRuntime['instrumentFetch']>> | undefined
    let opening: Promise<ConduitTable> | null = null
    const open = async (): Promise<ConduitTable> => {
      const credential = await runtime.getCredential(config)
      if (!credential) throw new NoUsableCredentialError()
      // Undefined without instrumentFetch; connect() then uses the
      // global fetch.
      instrumentation = runtime.instrumentFetch?.()
      source = await client.connect(config.suriObjectKey, credential, instrumentation?.fetchImpl)
      return source.open(JSON.stringify(config.suriConfig))
    }
    context.set(conduitTableContext, () => (opening ??= open()))

    try {
      return await next()
    } finally {
      if (source) {
        // A failed disconnect doesn't turn a decided response into an
        // error (INTEGRATIONS.md).
        try {
          await client.disconnect(source)
        } catch (err) {
          console.error(`${config.suriType} disconnect failed:`, err)
        }
      }
      // Read by dispatch() after the pipeline completes (observation.ts).
      if (instrumentation) context.set(providerBytesContext, instrumentation.finish())
    }
  }
}
