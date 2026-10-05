import type { GatewayContext } from './context.ts'
import { jsonResponse, problemResponse } from './response.ts'
import { jsonBodyContext } from './middleware/body.ts'
import { requireConduitConfig, requireConduitTable } from './require-context.ts'
import type { ConduitTable } from '@conduits/conduit'
import { toSourceFields, toWidgetFields, checkKnownFields, wrapRecord, extractFields, hasBodyId } from '@conduits/conduit'

// The single-record runBulkWrite (controller.ts): replace and update
// differ only in the ConduitTable method that writes.
async function runSingleWrite(
  table: ConduitTable,
  fieldMap: Record<string, string> | undefined,
  source: string,
  id: string,
  body: unknown,
  mode: 'update' | 'replace',
): Promise<Response> {
  if (hasBodyId(body)) return problemResponse('id_not_allowed', { detail: 'The id is in the path. Do not put it in the body.' })

  const fields = extractFields(body)
  if (!fields) return problemResponse('invalid_body', { detail: 'Send {fields: {...}}.' })

  checkKnownFields([fields], fieldMap, source)
  const sourceFields = toSourceFields(fields, fieldMap)
  const record =
    mode === 'update'
      ? await table.updateRecord({ id, fields: sourceFields })
      : await table.replaceRecord({ id, fields: sourceFields })
  if (!record) return problemResponse('record_not_found')
  return jsonResponse(wrapRecord({ id: record.id, fields: toWidgetFields(record.fields, fieldMap) }))
}

// The actions on a conduit's `/<id>` path (see dispatch.ts, which sets
// context.params.id). Hidden form fields apply only to create.
export interface GatewayItemActions {
  read(context: GatewayContext): Promise<Response>
  replace(context: GatewayContext): Promise<Response>
  update(context: GatewayContext): Promise<Response>
  destroy(context: GatewayContext): Promise<Response>
}

export function createGatewayItemActions(): GatewayItemActions {
  return {
    async read(context) {
      const config = requireConduitConfig(context)
      const table = requireConduitTable(context)
      const { fieldMap } = config.suriConfig
      // There is no get-by-id; listRecords() without paging returns
      // every record.
      const { records } = await table.listRecords()
      const record = records.find((r) => r.id === context.params.id)
      if (!record) return problemResponse('record_not_found')
      return jsonResponse(wrapRecord({ id: record.id, fields: toWidgetFields(record.fields, fieldMap) }))
    },

    async replace(context) {
      const config = requireConduitConfig(context)
      const table = requireConduitTable(context)
      const body = context.get(jsonBodyContext)
      const { fieldMap } = config.suriConfig
      return runSingleWrite(table, fieldMap, config.suriType, context.params.id, body, 'replace')
    },

    async update(context) {
      const config = requireConduitConfig(context)
      const table = requireConduitTable(context)
      const body = context.get(jsonBodyContext)
      const { fieldMap } = config.suriConfig
      return runSingleWrite(table, fieldMap, config.suriType, context.params.id, body, 'update')
    },

    async destroy(context) {
      const table = requireConduitTable(context)
      const ok = await table.deleteRecord(context.params.id)
      if (!ok) return problemResponse('record_not_found')
      return jsonResponse({ id: context.params.id, deleted: true })
    },
  }
}
