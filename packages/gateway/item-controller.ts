import type { GatewayContext } from './context.ts'
import { jsonResponse } from './response.ts'
import { jsonBodyContext } from './middleware/body.ts'
import { requireConduitConfig, requireConduitTable } from './require-context.ts'
import type { ConduitTable } from '@conduits/conduit'
import { toSourceFields, toWidgetFields, checkKnownFields, wrapRecord, extractFields, hasBodyId } from '@conduits/conduit'

// Single-record counterpart to controller.ts's runBulkWrite — replace
// and update differ only in which ConduitTable method actually writes.
async function runSingleWrite(
  table: ConduitTable,
  fieldMap: Record<string, string> | undefined,
  source: string,
  id: string,
  body: unknown,
  mode: 'update' | 'replace',
): Promise<Response> {
  if (hasBodyId(body)) return jsonResponse({ error: 'Bad Request' }, 400)

  const fields = extractFields(body)
  if (!fields) return jsonResponse({ error: 'Bad Request' }, 400)

  checkKnownFields(fields, fieldMap, source)
  const sourceFields = toSourceFields(fields, fieldMap)
  const record =
    mode === 'update'
      ? await table.updateRecord({ id, fields: sourceFields })
      : await table.replaceRecord({ id, fields: sourceFields })
  if (!record) return jsonResponse({ error: 'Not Found' }, 404)
  return jsonResponse(wrapRecord({ id: record.id, fields: toWidgetFields(record.fields, fieldMap) }))
}

// A conduit-path's `/<id>` actions (see dispatch.ts) — dispatch.ts sets
// context.params.id itself (there is no more `:id` router param to
// populate it automatically) before calling any of these. No
// hidden-form-field handling — only create goes through that.
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
      // No dedicated get-by-id method — listRecords() with no page
      // params returns everything.
      const { records } = await table.listRecords()
      const record = records.find((r) => r.id === context.params.id)
      if (!record) return jsonResponse({ error: 'Not Found' }, 404)
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
      if (!ok) return jsonResponse({ error: 'Not Found' }, 404)
      return jsonResponse({ id: context.params.id, deleted: true })
    },
  }
}
