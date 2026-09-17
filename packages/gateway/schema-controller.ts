import type { GatewayContext } from './context.ts'
import { jsonResponse } from './response.ts'
import { requireConduitConfig, requireConduitTable } from './require-context.ts'
import { reverseFieldMap } from '@conduits/conduit'

// A conduit-path's `<base>/.conduits/schema` action (see dispatch.ts) —
// runs behind createSchemaGatewayMiddleware(deps), which always
// requires a bearer token, unlike every other gateway action.
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
