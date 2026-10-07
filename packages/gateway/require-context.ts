import type { GatewayContext } from './context.ts'
import { conduitConfigContext } from './middleware/conduit-config.ts'
import { conduitTableContext } from './middleware/source-client.ts'
import type { ConduitConfig } from './types.ts'
import type { ConduitTable } from '@conduits/conduit'

// Actions in controller.ts, item-controller.ts and schema-controller.ts
// run only after the middleware that sets these values
// (resolveConduitConfig, loadConduitTable; see pipeline.ts), but the
// types can't express that across modules. Throws if a value is
// missing, as middleware/*.ts do.
export function requireConduitConfig(context: GatewayContext): ConduitConfig {
  const config = context.get(conduitConfigContext)
  if (!config) throw new Error('requires resolveConduitConfig() middleware to run first')
  return config
}

// The conduit's table, opening the source on the first call. An action
// asks for it only once it has checked the request, so a request it
// refuses or drops never reaches the provider.
export function openConduitTable(context: GatewayContext): Promise<ConduitTable> {
  const open = context.get(conduitTableContext)
  if (!open) throw new Error('requires loadConduitTable() middleware to run first')
  return open()
}
