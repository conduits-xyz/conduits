import type { GatewayContext } from './context.ts'
import { jsonResponse } from './response.ts'
import { openConduitTable, requireConduitConfig } from './require-context.ts'
import { reverseFieldMap, type ConduitFieldType, type FieldType } from '@conduits/conduit'

// What a source's own column type is as a field type, for a conduit
// that declares no fields.
const FROM_SOURCE_TYPE: Record<ConduitFieldType, FieldType> = { string: 'text', number: 'number', date: 'date', boolean: 'text' }

// A conduit's `<base>/.conduits/schema` (see dispatch.ts), behind
// createSchemaGatewayMiddleware(deps), which always requires a token.
// A conduit that declares its fields gets them, each with its type and
// a choice field's options, without a call to the source. One that
// doesn't gets the source's columns, typed as the source describes
// them.
export async function gatewaySchemaAction(context: GatewayContext): Promise<Response> {
  const config = requireConduitConfig(context)
  const declared = Object.entries(config.fields)
  if (declared.length > 0) {
    return jsonResponse({ fields: declared.map(([name, schema]) => ({ name, ...schema })) })
  }

  const table = await openConduitTable(context)
  const { fieldMap } = config.suriConfig
  const bySourceName = fieldMap ? reverseFieldMap(fieldMap) : undefined
  const fields = await table.describeFields()
  return jsonResponse({
    fields: fields.map((field) => ({ name: bySourceName?.[field.name] ?? field.name, type: FROM_SOURCE_TYPE[field.type] })),
  })
}
