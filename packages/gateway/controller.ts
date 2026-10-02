import type { GatewayContext } from './context.ts'
import type { GatewayDeps } from './pipeline.ts'
import { jsonResponse } from './response.ts'
import type { ConduitTable } from '@conduits/conduit'
import { jsonBodyContext } from './middleware/body.ts'
import { requireConduitConfig, requireConduitTable } from './require-context.ts'
import { checkHiddenFormField } from './middleware/hidden-form-field.ts'
import { honeypotDropCountContext } from './observation.ts'
import {
  randomRowId,
  type ConduitRecord,
  type ConduitFields,
  toSourceFields,
  toWidgetFields,
  checkKnownFields,
  wrapRecord,
  isBulkBody,
  extractFields,
  extractBulkRecords,
  extractIds,
  hasBodyId,
  hasDuplicateIds,
  exceedsBulkLimit,
  sourceClients,
  type WireRecord,
} from '@conduits/conduit'

// A reserved field a plain HTML <form> (e.g.
// library/pages/progressive-enhancement-form) can include as a hidden
// input to be redirected after a create instead of getting JSON.
const REDIRECT_FIELD = '_redirect'

// Redirects only to the origin the request's Referer names; otherwise,
// or without a Referer, the response is the usual JSON.
function resolveRedirectTarget(fields: Record<string, unknown> | undefined, request: Request): string | null {
  const raw = fields?.[REDIRECT_FIELD]
  if (typeof raw !== 'string' || raw.trim() === '') return null

  const referer = request.headers.get('referer')
  if (!referer) return null

  try {
    const refererOrigin = new URL(referer).origin
    const target = new URL(raw, refererOrigin)
    if (target.origin !== refererOrigin) return null
    return target.toString()
  } catch {
    return null
  }
}

// Dropped records (a tripped honeypot or pass-if-match mismatch) are
// counted though never written. The count is kept on the context for
// dispatch() to read, beside providerBytesContext (observation.ts).
function recordHoneypotDrops(context: GatewayContext, count: number): void {
  if (count > 0) context.set(honeypotDropCountContext, count)
}

// Applies a bulk update or replace in one source call (bulkWriteRows in
// sheets.ts): either every id resolves and all are written, or nothing
// is. Hidden form fields apply only to create.
async function runBulkWrite(
  table: ConduitTable,
  fieldMap: Record<string, string> | undefined,
  source: string,
  body: unknown,
  mode: 'update' | 'replace',
): Promise<Response> {
  if (!isBulkBody(body)) return jsonResponse({ error: 'Bad Request' }, 400)
  if (exceedsBulkLimit(body.records.length)) return jsonResponse({ error: 'Bad Request' }, 400)
  const entries = extractBulkRecords(body.records, true)
  if (!entries) return jsonResponse({ error: 'Bad Request' }, 400)
  if (hasDuplicateIds(entries.map((entry) => entry.id))) return jsonResponse({ error: 'Bad Request' }, 400)

  const toWrite: ConduitRecord[] = entries.map((entry) => {
    checkKnownFields(entry.fields, fieldMap, source)
    return { id: entry.id, fields: toSourceFields(entry.fields, fieldMap) }
  })

  const written = mode === 'update' ? await table.updateRecords(toWrite) : await table.replaceRecords(toWrite)
  if (written === null) return jsonResponse({ error: 'Not Found' }, 404)

  const records: WireRecord[] = written.map((record) =>
    wrapRecord({ id: record.id, fields: toWidgetFields(record.fields, fieldMap) }),
  )
  return jsonResponse({ records })
}

// The actions on a conduit's base path (list, create, bulk update,
// replace and delete), chosen by HTTP method (see dispatch.ts), each
// behind createGatewayMiddleware(deps) via run-middleware.ts.
export interface GatewayActions {
  list(context: GatewayContext): Promise<Response>
  write(context: GatewayContext): Promise<Response>
  bulkUpdate(context: GatewayContext): Promise<Response>
  bulkReplace(context: GatewayContext): Promise<Response>
  bulkDestroy(context: GatewayContext): Promise<Response>
}

export function createGatewayActions(deps: GatewayDeps): GatewayActions {
  return {
    async list(context) {
      const config = requireConduitConfig(context)
      const table = requireConduitTable(context)
      const { fieldMap } = config.suriConfig

      const cursor = context.url.searchParams.get('cursor') ?? undefined
      const limitParam = context.url.searchParams.get('limit')
      let limit: number | undefined
      if (limitParam !== null) {
        limit = Number(limitParam)
        if (!Number.isInteger(limit) || limit <= 0) return jsonResponse({ error: 'Bad Request' }, 400)
      }

      const { records, nextCursor } = await table.listRecords({ cursor, limit })
      return jsonResponse({
        records: records.map((record) => wrapRecord({ id: record.id, fields: toWidgetFields(record.fields, fieldMap) })),
        nextCursor,
      })
    },

    async write(context) {
      const config = requireConduitConfig(context)
      const table = requireConduitTable(context)
      const body = context.get(jsonBodyContext)
      const rules = config.hiddenFormField
      const { fieldMap } = config.suriConfig

      // One record (`{fields}`) or several (`{records: [{fields}, ...]}`);
      // the body's shape decides (isBulkBody in record-shape.ts).
      if (isBulkBody(body)) {
        // Refused for sources whose records are emails that can't be
        // unsent (ConduitSourceCapabilities.bulkCreate).
        if (!sourceClients[config.suriType]?.capabilities().bulkCreate) {
          return jsonResponse({ error: 'Bad Request' }, 400)
        }
        if (exceedsBulkLimit(body.records.length)) return jsonResponse({ error: 'Bad Request' }, 400)
        const entries = extractBulkRecords(body.records, false)
        if (!entries) return jsonResponse({ error: 'Bad Request' }, 400)

        // _redirect is reserved here too, so it is never stored.
        for (const entry of entries) {
          if (REDIRECT_FIELD in entry) delete entry[REDIRECT_FIELD]
        }

        // Dropped records are not written; the rest go in one
        // createRecords call.
        const outcomes = entries.map((entry) => checkHiddenFormField(rules, entry))
        const toAppend: ConduitFields[] = []
        for (const outcome of outcomes) {
          if (outcome.outcome === 'ok') {
            checkKnownFields(outcome.fields, fieldMap, config.suriType)
            toAppend.push(toSourceFields(outcome.fields, fieldMap))
          }
        }
        const appended = toAppend.length === 0 ? [] : await table.createRecords(toAppend)

        let cursor = 0
        const records: WireRecord[] = outcomes.map((outcome) => {
          if (outcome.outcome === 'dropped') {
            return wrapRecord({ id: randomRowId(), fields: outcome.fields })
          }
          const record = appended[cursor++]
          return wrapRecord({ id: record.id, fields: toWidgetFields(record.fields, fieldMap) })
        })
        const droppedCount = outcomes.filter((outcome) => outcome.outcome === 'dropped').length
        recordHoneypotDrops(context, droppedCount)
        return jsonResponse({ records }, 201)
      }

      // Callers can't set an id on create (record-shape.ts).
      if (hasBodyId(body)) return jsonResponse({ error: 'Bad Request' }, 400)

      // Removed from the fields before extractFields(), so it isn't
      // stored.
      const rawFields = (body as { fields?: Record<string, unknown> }).fields
      const redirectTarget = resolveRedirectTarget(rawFields, context.request)
      if (rawFields && REDIRECT_FIELD in rawFields) delete rawFields[REDIRECT_FIELD]

      const fields = extractFields(body)
      if (!fields) return jsonResponse({ error: 'Bad Request' }, 400)

      const outcome = checkHiddenFormField(rules, fields)
      if (outcome.outcome === 'dropped') {
        // The same 201 and redirect as a stored record, so a dropped one
        // looks like a success.
        recordHoneypotDrops(context, 1)
        if (redirectTarget) return Response.redirect(redirectTarget, 303)
        return jsonResponse(wrapRecord({ id: randomRowId(), fields: outcome.fields }), 201)
      }

      checkKnownFields(outcome.fields, fieldMap, config.suriType)
      const record = await table.createRecord(toSourceFields(outcome.fields, fieldMap))
      if (redirectTarget) return Response.redirect(redirectTarget, 303)
      return jsonResponse(wrapRecord({ id: record.id, fields: toWidgetFields(record.fields, fieldMap) }), 201)
    },

    async bulkUpdate(context) {
      const config = requireConduitConfig(context)
      const table = requireConduitTable(context)
      const body = context.get(jsonBodyContext)
      const { fieldMap } = config.suriConfig
      return runBulkWrite(table, fieldMap, config.suriType, body, 'update')
    },

    async bulkReplace(context) {
      const config = requireConduitConfig(context)
      const table = requireConduitTable(context)
      const body = context.get(jsonBodyContext)
      const { fieldMap } = config.suriConfig
      return runBulkWrite(table, fieldMap, config.suriType, body, 'replace')
    },

    async bulkDestroy(context) {
      const table = requireConduitTable(context)
      const body = context.get(jsonBodyContext)
      const ids = extractIds(body)
      if (!ids) return jsonResponse({ error: 'Bad Request' }, 400)
      if (exceedsBulkLimit(ids.length)) return jsonResponse({ error: 'Bad Request' }, 400)
      if (hasDuplicateIds(ids)) return jsonResponse({ error: 'Bad Request' }, 400)

      // One deleteRecords call, so the batch is deleted entirely or not
      // at all.
      const ok = await table.deleteRecords(ids)
      if (!ok) return jsonResponse({ error: 'Not Found' }, 404)
      return jsonResponse({ records: ids.map((id) => ({ id, deleted: true })) })
    },
  }
}
