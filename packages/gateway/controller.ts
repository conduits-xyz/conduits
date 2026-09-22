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

// A reserved field name a plain HTML <form> (library/pages/progressive-enhancement-form) can
// include as a hidden input to get redirected to its own "thanks" page
// after a real create, instead of landing on this endpoint's raw JSON
// body.
const REDIRECT_FIELD = '_redirect'

// Only ever redirects to the same origin the request's own Referer names.
// Anything else, or no Referer to check against, falls back to the normal
// JSON response.
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

// A dropped record (honeypot tripped, or a pass-if-match mismatch) is
// counted even though it's never written, for reporting elsewhere —
// stashed on the context for dispatch()'s own outer wrapper to read
// back once, alongside providerBytesContext (see observation.ts),
// rather than a separate recordEvent call per drop the way this used
// to work.
function recordHoneypotDrops(context: GatewayContext, count: number): void {
  if (count > 0) context.set(honeypotDropCountContext, count)
}

// Applies a bulk update/replace as one Sheets API call for the whole batch
// (see packages/conduit/sheets.ts's bulkWriteRows). Atomic: either every
// entry's id resolves and all are written, or (any id missing) nothing is.
//
// No hidden-form-field handling here — hff only ever applies to create
// (see write() below).
async function runBulkWrite(
  table: ConduitTable,
  fieldMap: Record<string, string> | undefined,
  body: unknown,
  mode: 'update' | 'replace',
): Promise<Response> {
  if (!isBulkBody(body)) return jsonResponse({ error: 'Bad Request' }, 400)
  if (exceedsBulkLimit(body.records.length)) return jsonResponse({ error: 'Bad Request' }, 400)
  const entries = extractBulkRecords(body.records, true)
  if (!entries) return jsonResponse({ error: 'Bad Request' }, 400)
  if (hasDuplicateIds(entries.map((entry) => entry.id))) return jsonResponse({ error: 'Bad Request' }, 400)

  const toWrite: ConduitRecord[] = entries.map((entry) => ({
    id: entry.id,
    fields: toSourceFields(entry.fields, fieldMap),
  }))

  const written = mode === 'update' ? await table.updateRecords(toWrite) : await table.replaceRecords(toWrite)
  if (written === null) return jsonResponse({ error: 'Not Found' }, 404)

  const records: WireRecord[] = written.map((record) =>
    wrapRecord({ id: record.id, fields: toWidgetFields(record.fields, fieldMap) }),
  )
  return jsonResponse({ records })
}

// The "bare" conduit-path actions (see dispatch.ts) — list/create/bulk
// update/bulk replace/bulk destroy, dispatched by HTTP method rather
// than by remix's own route-action mapping (see dispatch.ts for why).
// Each still runs behind createGatewayMiddleware(deps) — dispatch.ts
// invokes that itself via run-middleware.ts, identically to how
// remix's router used to.
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

      // A single record (`{fields}`) or a bulk array (`{records:
      // [{fields}, ...]}`) on this same create endpoint — shape alone
      // decides which (see packages/conduit/record-shape.ts's isBulkBody).
      if (isBulkBody(body)) {
        // A source whose createRecords loops over independent,
        // irreversible side effects (Fastmail/Gmail: each is a real,
        // already-sent email) can't safely accept a bulk create — a
        // partial-batch failure has no way to report what already
        // succeeded, so a caller's retry would resend it. See
        // ConduitSourceCapabilities.bulkCreate's own doc.
        if (!sourceClients[config.suriType]?.capabilities().bulkCreate) {
          return jsonResponse({ error: 'Bad Request' }, 400)
        }
        if (exceedsBulkLimit(body.records.length)) return jsonResponse({ error: 'Bad Request' }, 400)
        const entries = extractBulkRecords(body.records, false)
        if (!entries) return jsonResponse({ error: 'Bad Request' }, 400)

        // _redirect is reserved everywhere, not just the single-record
        // path below, so it never leaks into Sheets as literal data.
        for (const entry of entries) {
          if (REDIRECT_FIELD in entry) delete entry[REDIRECT_FIELD]
        }

        // A dropped record (tripped honeypot or mismatched pass-if-match)
        // never reaches Sheets; everything else is appended in one
        // createRecords call for the whole batch.
        const outcomes = entries.map((entry) => checkHiddenFormField(rules, entry))
        const toAppend: ConduitFields[] = []
        for (const outcome of outcomes) {
          if (outcome.outcome === 'ok') {
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

      // A caller can't assign their own id on create (see packages/conduit/record-shape.ts).
      if (hasBodyId(body)) return jsonResponse({ error: 'Bad Request' }, 400)

      // Resolved and stripped from the fields before extractFields() below,
      // so REDIRECT_FIELD never gets written into the sheet as a literal
      // column.
      const rawFields = (body as { fields?: Record<string, unknown> }).fields
      const redirectTarget = resolveRedirectTarget(rawFields, context.request)
      if (rawFields && REDIRECT_FIELD in rawFields) delete rawFields[REDIRECT_FIELD]

      const fields = extractFields(body)
      if (!fields) return jsonResponse({ error: 'Bad Request' }, 400)

      const outcome = checkHiddenFormField(rules, fields)
      if (outcome.outcome === 'dropped') {
        // Same 201 (and _redirect handling) a real create returns — a
        // dropped record must be indistinguishable from a real success.
        recordHoneypotDrops(context, 1)
        if (redirectTarget) return Response.redirect(redirectTarget, 303)
        return jsonResponse(wrapRecord({ id: randomRowId(), fields: outcome.fields }), 201)
      }

      const record = await table.createRecord(toSourceFields(outcome.fields, fieldMap))
      if (redirectTarget) return Response.redirect(redirectTarget, 303)
      return jsonResponse(wrapRecord({ id: record.id, fields: toWidgetFields(record.fields, fieldMap) }), 201)
    },

    async bulkUpdate(context) {
      const config = requireConduitConfig(context)
      const table = requireConduitTable(context)
      const body = context.get(jsonBodyContext)
      const { fieldMap } = config.suriConfig
      return runBulkWrite(table, fieldMap, body, 'update')
    },

    async bulkReplace(context) {
      const config = requireConduitConfig(context)
      const table = requireConduitTable(context)
      const body = context.get(jsonBodyContext)
      const { fieldMap } = config.suriConfig
      return runBulkWrite(table, fieldMap, body, 'replace')
    },

    async bulkDestroy(context) {
      const table = requireConduitTable(context)
      const body = context.get(jsonBodyContext)
      const ids = extractIds(body)
      if (!ids) return jsonResponse({ error: 'Bad Request' }, 400)
      if (exceedsBulkLimit(ids.length)) return jsonResponse({ error: 'Bad Request' }, 400)
      if (hasDuplicateIds(ids)) return jsonResponse({ error: 'Bad Request' }, 400)

      // One deleteRecords call for the whole batch — atomic, so a bad id
      // can't leave some of the batch deleted and some not.
      const ok = await table.deleteRecords(ids)
      if (!ok) return jsonResponse({ error: 'Not Found' }, 404)
      return jsonResponse({ records: ids.map((id) => ({ id, deleted: true })) })
    },
  }
}
