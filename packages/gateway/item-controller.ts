import { createController } from 'remix/router'

import { gatewayRoutes } from './routes.ts'
import type { GatewayContext } from './context.ts'
import { createGatewayMiddleware, type GatewayDeps } from './pipeline.ts'
import { jsonResponse } from './response.ts'
import { conduitTableContext } from './middleware/source-client.ts'
import { jsonBodyContext } from './middleware/body.ts'
import { conduitConfigContext } from './middleware/conduit-config.ts'
import type { ConduitTable } from '@conduits/conduit'
import { toSourceFields, toWidgetFields, wrapRecord, extractFields, hasBodyId } from '@conduits/conduit'

// Single-record counterpart to controller.ts's runBulkWrite — replace
// and update differ only in which ConduitTable method actually writes.
async function runSingleWrite(
  table: ConduitTable,
  fieldMap: Record<string, string> | undefined,
  id: string,
  body: unknown,
  mode: 'update' | 'replace',
): Promise<Response> {
  if (hasBodyId(body)) return jsonResponse({ error: 'Bad Request' }, 400)

  const fields = extractFields(body)
  if (!fields) return jsonResponse({ error: 'Bad Request' }, 400)

  const sourceFields = toSourceFields(fields, fieldMap)
  const record =
    mode === 'update'
      ? await table.updateRecord({ id, fields: sourceFields })
      : await table.replaceRecord({ id, fields: sourceFields })
  if (!record) return jsonResponse({ error: 'Not Found' }, 404)
  return jsonResponse(wrapRecord({ id: record.id, fields: toWidgetFields(record.fields, fieldMap) }))
}

// No hidden-form-field handling on replace/update — only on create.
export function createGatewayItemController(deps: GatewayDeps) {
  return createController<typeof gatewayRoutes.item, GatewayContext, ReturnType<typeof createGatewayMiddleware>>(
    gatewayRoutes.item,
    {
      middleware: createGatewayMiddleware(deps),
      actions: {
        async read(context) {
          const config = context.get(conduitConfigContext)
          const table = context.get(conduitTableContext)
          const { fieldMap } = config.suriConfig
          // No dedicated get-by-id method — listRecords() with no page
          // params returns everything.
          const { records } = await table.listRecords()
          const record = records.find((r) => r.id === context.params.id)
          if (!record) return jsonResponse({ error: 'Not Found' }, 404)
          return jsonResponse(wrapRecord({ id: record.id, fields: toWidgetFields(record.fields, fieldMap) }))
        },

        async replace(context) {
          const config = context.get(conduitConfigContext)
          const table = context.get(conduitTableContext)
          const body = context.get(jsonBodyContext)
          const { fieldMap } = config.suriConfig
          return runSingleWrite(table, fieldMap, context.params.id, body, 'replace')
        },

        async update(context) {
          const config = context.get(conduitConfigContext)
          const table = context.get(conduitTableContext)
          const body = context.get(jsonBodyContext)
          const { fieldMap } = config.suriConfig
          return runSingleWrite(table, fieldMap, context.params.id, body, 'update')
        },

        async destroy(context) {
          const table = context.get(conduitTableContext)
          const ok = await table.deleteRecord(context.params.id)
          if (!ok) return jsonResponse({ error: 'Not Found' }, 404)
          return jsonResponse({ id: context.params.id, deleted: true })
        },
      },
    },
  )
}
