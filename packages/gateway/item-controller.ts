import type { GatewayContext } from './context.ts'
import { jsonResponse, problemResponse } from './response.ts'
import { formBodyContext, jsonBodyContext } from './middleware/body.ts'
import { refuseUnknownMembers } from './request-members.ts'
import { openConduitTable, requireConduitConfig } from './require-context.ts'
import { checkFieldValues, toClientFields, toStoredFields } from './field-values.ts'
import type { ConduitConfig } from './types.ts'
import type { ConduitTable } from '@conduits/conduit'
import { checkKnownFields, wrapRecord, extractFields, hasBodyId } from '@conduits/conduit'

// The single-record runBulkWrite (controller.ts): replace and update
// differ only in the ConduitTable method that writes.
async function runSingleWrite(
  openTable: () => Promise<ConduitTable>,
  config: ConduitConfig,
  id: string,
  body: Record<string, unknown>,
  mode: 'update' | 'replace',
  form: boolean,
): Promise<Response> {
  if (hasBodyId(body)) return problemResponse('id_not_allowed', { detail: 'The id is in the path. Do not put it in the body.' })
  const unknown = refuseUnknownMembers(body, ['fields'])
  if (unknown) return unknown

  const fields = extractFields(body)
  if (!fields) return problemResponse('invalid_body', { detail: 'Send {fields: {...}}.' })

  checkKnownFields([fields], config.suriConfig.fieldMap, config.suriType)
  const checked = checkFieldValues([fields], config, { bulk: false, form })
  if (checked instanceof Response) return checked
  const sourceFields = toStoredFields(checked[0]!, config)
  const table = await openTable()
  const record =
    mode === 'update'
      ? await table.updateRecord({ id, fields: sourceFields })
      : await table.replaceRecord({ id, fields: sourceFields })
  if (!record) return problemResponse('record_not_found')
  return jsonResponse(wrapRecord({ id: record.id, fields: toClientFields(record.fields, config) }))
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
      const table = await openConduitTable(context)
      // There is no get-by-id; listRecords() without paging returns
      // every record.
      const { records } = await table.listRecords()
      const record = records.find((r) => r.id === context.params.id)
      if (!record) return problemResponse('record_not_found')
      return jsonResponse(wrapRecord({ id: record.id, fields: toClientFields(record.fields, config) }))
    },

    async replace(context) {
      const config = requireConduitConfig(context)
      const body = context.get(jsonBodyContext)
      return runSingleWrite(() => openConduitTable(context), config, context.params.id, body, 'replace', context.get(formBodyContext))
    },

    async update(context) {
      const config = requireConduitConfig(context)
      const body = context.get(jsonBodyContext)
      return runSingleWrite(() => openConduitTable(context), config, context.params.id, body, 'update', context.get(formBodyContext))
    },

    async destroy(context) {
      const table = await openConduitTable(context)
      const ok = await table.deleteRecord(context.params.id)
      if (!ok) return problemResponse('record_not_found')
      return jsonResponse({ id: context.params.id, deleted: true })
    },
  }
}
