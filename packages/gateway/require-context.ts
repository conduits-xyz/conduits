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

export function requireConduitTable(context: GatewayContext): ConduitTable {
  const table = context.get(conduitTableContext)
  if (!table) throw new Error('requires loadConduitTable() middleware to run first')
  return table
}
