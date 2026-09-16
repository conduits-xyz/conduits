import { createContextKey, type Middleware } from 'remix/router'
import { sourceClients, type ConduitTable } from '@conduits/conduit'

import { jsonResponse } from '../response.ts'
import type { GatewayRuntime } from '../types.ts'
import { conduitConfigContext } from './conduit-config.ts'

export const conduitTableContext = createContextKey<ConduitTable>()

// Dispatches on the resolved config's own suriType — the actual
// registration point new integrations plug into is `sourceClients` in
// packages/conduit, not this file. connect()/open() happen here, once per
// request, and disconnect() runs from the same place once the request is
// done.
//
// Folds what used to be a separate loadCredential() step in here too:
// runtime.getCredential() is the one place a usable credential comes
// from now, called directly rather than through its own middleware/
// context key.
export function loadConduitTable(
  runtime: GatewayRuntime,
): Middleware<{ key: typeof conduitTableContext; value: ConduitTable }> {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('loadConduitTable() requires resolveConduitConfig() middleware to run first')

    const client = sourceClients[config.suriType]
    if (!client) {
      return jsonResponse({ error: `Unsupported source: '${config.suriType}'` }, 500)
    }

    const credential = await runtime.getCredential(config)
    if (!credential) return jsonResponse({ error: 'Service Unavailable' }, 502)

    const source = await client.connect(config.suriObjectKey, credential)
    try {
      context.set(conduitTableContext, source.open(JSON.stringify(config.suriConfig)))
      return await next()
    } finally {
      // Best-effort, per INTEGRATIONS.md — a failed disconnect (releasing a
      // pooled connection, an IMAP LOGOUT) shouldn't turn an
      // already-decided response into an error.
      try {
        await client.disconnect(source)
      } catch (err) {
        console.error(`${config.suriType} disconnect failed:`, err)
      }
    }
  }
}
