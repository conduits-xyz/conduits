import type { GatewayContext } from './context.ts'
import { conduitConfigContext } from './middleware/conduit-config.ts'
import { conduitTableContext } from './middleware/source-client.ts'
import type { ConduitConfig } from './types.ts'
import type { ConduitTable } from '@conduits/conduit'

// Every action in controller.ts/item-controller.ts/schema-controller.ts
// only ever runs behind a middleware chain that has already set these
// (resolveConduitConfig, loadConduitTable — see pipeline.ts) — true by
// construction (dispatch.ts always runs the right pipeline first), but
// not something the type system can see across the module boundary
// now that actions are plain functions rather than a remix controller
// whose own generic tied the two together. Same fail-loud pattern
// every middleware/*.ts already uses for the same reason.
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
