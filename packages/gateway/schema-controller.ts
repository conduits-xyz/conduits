import type { GatewayContext } from './context.ts'
import { jsonResponse } from './response.ts'
import { requireConduitConfig, requireConduitTable } from './require-context.ts'
import { reverseFieldMap } from '@conduits/conduit'

// A conduit's `<base>/.conduits/schema` (see dispatch.ts), behind
// createSchemaGatewayMiddleware(deps), which always requires a token.
export async function gatewaySchemaAction(context: GatewayContext): Promise<Response> {
  const config = requireConduitConfig(context)
  const table = requireConduitTable(context)
  const { fieldMap } = config.suriConfig
  const bySourceName = fieldMap ? reverseFieldMap(fieldMap) : undefined

  const fields = await table.describeFields()
  return jsonResponse({
    fields: fields.map((field) => ({ ...field, name: bySourceName?.[field.name] ?? field.name })),
  })
}
