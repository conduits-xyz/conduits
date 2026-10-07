import type { GatewayContext } from './context.ts'
import type { GatewayDeps } from './pipeline.ts'
import { jsonResponse, problemResponse } from './response.ts'
import type { ConduitTable } from '@conduits/conduit'
import { formBodyContext, jsonBodyContext } from './middleware/body.ts'
import { openConduitTable, requireConduitConfig } from './require-context.ts'
import { checkHiddenFormField } from './middleware/hidden-form-field.ts'
import { honeypotDropCountContext } from './observation.ts'
import { refuseUnknownMembers } from './request-members.ts'
import { checkFieldValues, toClientFields, toStoredFields } from './field-values.ts'
import type { ConduitConfig } from './types.ts'
import {
  createRowIdMaker,
  type ConduitRecord,
  type ConduitFields,
  checkKnownFields,
  wrapRecord,
  isBulkBody,
  extractFields,
  extractBulkRecords,
  extractIds,
  hasBodyId,
  hasDuplicateIds,
  exceedsBulkLimit,
  MAX_BULK_RECORDS,
  type WireRecord,
} from '@conduits/conduit'

const TOO_MANY_RECORDS = { detail: `Send ${MAX_BULK_RECORDS} records or ids or fewer.` }
// The members of each item of `records`. An id on a created record is
// refused by extractBulkRecords, as invalid_body.
const RECORD_MEMBERS = ['id', 'fields']

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
  openTable: () => Promise<ConduitTable>,
  config: ConduitConfig,
  body: Record<string, unknown>,
  mode: 'update' | 'replace',
  form: boolean,
): Promise<Response> {
  if (!isBulkBody(body)) return problemResponse('invalid_body', { detail: 'Send {records: [{id, fields}, ...]}.' })
  const unknown = refuseUnknownMembers(body, ['records'], RECORD_MEMBERS)
  if (unknown) return unknown
  if (exceedsBulkLimit(body.records.length)) return problemResponse('too_many_records', TOO_MANY_RECORDS)
  const entries = extractBulkRecords(body.records, true)
  if (!entries) return problemResponse('invalid_body', { detail: 'Each record needs an id and fields.' })
  if (hasDuplicateIds(entries.map((entry) => entry.id))) return problemResponse('duplicate_ids')

  checkKnownFields(entries.map((entry) => entry.fields), config.suriConfig.fieldMap, config.suriType)
  const checked = checkFieldValues(entries.map((entry) => entry.fields), config, { bulk: true, form })
  if (checked instanceof Response) return checked
  const toWrite: ConduitRecord[] = entries.map((entry, i) => ({ id: entry.id, fields: toStoredFields(checked[i]!, config) }))

  const table = await openTable()
  const written = mode === 'update' ? await table.updateRecords(toWrite) : await table.replaceRecords(toWrite)
  if (written === null) return problemResponse('record_not_found', { detail: 'An id does not exist. Nothing was written.' })

  const records: WireRecord[] = written.map((record) => wrapRecord({ id: record.id, fields: toClientFields(record.fields, config) }))
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
  // Ids for records a hidden form field drops, which look like stored
  // ones but are never written.
  const makeRowId = createRowIdMaker(() => deps.clock.now().getTime())
  return {
    async list(context) {
      const config = requireConduitConfig(context)

      const cursorParam = context.url.searchParams.get('cursor')
      const cursor = cursorParam === null ? undefined : decodeListCursor(cursorParam)
      if (cursor === null) return problemResponse('unknown_cursor', { detail: 'Send nextCursor from the previous page without changes.' })
      const limitParam = context.url.searchParams.get('limit')
      const limit = limitParam === null ? deps.listLimits.default : Number(limitParam)
      if (!Number.isInteger(limit) || limit <= 0 || limit > deps.listLimits.max) {
        return problemResponse('invalid_limit', { detail: `limit must be a whole number from 1 to ${deps.listLimits.max}.` })
      }

      const table = await openConduitTable(context)
      const { records, nextCursor } = await table.listRecords({ cursor, limit })
      return jsonResponse({
        records: records.map((record) => wrapRecord({ id: record.id, fields: toClientFields(record.fields, config) })),
        nextCursor: nextCursor === null ? null : encodeListCursor(nextCursor),
      })
    },

    async write(context) {
      const config = requireConduitConfig(context)
      const body = context.get(jsonBodyContext)
      const rules = config.hiddenFormField

      // One record (`{fields}`) or several (`{records: [{fields}, ...]}`);
      // the body's shape decides (isBulkBody in record-shape.ts).
      if (isBulkBody(body)) {
        // Refused for sources whose records are emails that can't be
        // unsent (ConduitSourceCapabilities.bulkCreate).
        if (!deps.sourceClients[config.suriType]?.capabilities().bulkCreate) {
          return problemResponse('bulk_not_supported', { detail: 'Send one record at a time to this conduit.' })
        }
        if (exceedsBulkLimit(body.records.length)) return problemResponse('too_many_records', TOO_MANY_RECORDS)
        const unknown = refuseUnknownMembers(body, ['records'], RECORD_MEMBERS)
        if (unknown) return unknown
        const entries = extractBulkRecords(body.records, false)
        if (!entries) return problemResponse('invalid_body', { detail: 'Each record needs fields and no id.' })

        // _redirect is reserved here too, so it is never stored.
        for (const entry of entries) {
          if (REDIRECT_FIELD in entry) delete entry[REDIRECT_FIELD]
        }

        // Dropped records are not written; the rest go in one
        // createRecords call.
        const outcomes = entries.map((entry) => checkHiddenFormField(rules, entry))
        const kept = outcomes.flatMap((outcome) => (outcome.outcome === 'ok' ? [outcome.fields] : []))
        checkKnownFields(kept, config.suriConfig.fieldMap, config.suriType)
        // Pointers index the body's records, dropped ones included.
        const checked = checkFieldValues(
          outcomes.map((outcome) => (outcome.outcome === 'ok' ? outcome.fields : null)),
          config,
          { bulk: true, form: context.get(formBodyContext) },
        )
        if (checked instanceof Response) return checked
        const toAppend: ConduitFields[] = checked.map((fields) => toStoredFields(fields, config))
        const appended = toAppend.length === 0 ? [] : await (await openConduitTable(context)).createRecords(toAppend)

        let cursor = 0
        const records: WireRecord[] = outcomes.map((outcome) => {
          if (outcome.outcome === 'dropped') {
            return wrapRecord({ id: makeRowId(), fields: outcome.fields })
          }
          const record = appended[cursor++]
          return wrapRecord({ id: record.id, fields: toClientFields(record.fields, config) })
        })
        const droppedCount = outcomes.filter((outcome) => outcome.outcome === 'dropped').length
        recordHoneypotDrops(context, droppedCount)
        return jsonResponse({ records }, 201)
      }

      // Callers can't set an id on create (record-shape.ts).
      if (hasBodyId(body)) return problemResponse('id_not_allowed', { detail: 'The gateway makes the id of a new record.' })
      const unknown = refuseUnknownMembers(body, ['fields'])
      if (unknown) return unknown

      // Removed from the fields before extractFields(), so it isn't
      // stored.
      const rawFields = (body as { fields?: Record<string, unknown> }).fields
      const redirectTarget = resolveRedirectTarget(rawFields, context.request)
      if (rawFields && REDIRECT_FIELD in rawFields) delete rawFields[REDIRECT_FIELD]

      const fields = extractFields(body)
      if (!fields) return problemResponse('invalid_body', { detail: 'Send {fields: {...}}.' })

      const outcome = checkHiddenFormField(rules, fields)
      if (outcome.outcome === 'dropped') {
        // The same 201 and redirect as a stored record, so a dropped one
        // looks like a success.
        recordHoneypotDrops(context, 1)
        if (redirectTarget) return Response.redirect(redirectTarget, 303)
        return jsonResponse(wrapRecord({ id: makeRowId(), fields: outcome.fields }), 201)
      }

      checkKnownFields([outcome.fields], config.suriConfig.fieldMap, config.suriType)
      const checked = checkFieldValues([outcome.fields], config, { bulk: false, form: context.get(formBodyContext) })
      if (checked instanceof Response) return checked
      const record = await (await openConduitTable(context)).createRecord(toStoredFields(checked[0]!, config))
      if (redirectTarget) return Response.redirect(redirectTarget, 303)
      return jsonResponse(wrapRecord({ id: record.id, fields: toClientFields(record.fields, config) }), 201)
    },

    async bulkUpdate(context) {
      const config = requireConduitConfig(context)
      const body = context.get(jsonBodyContext)
      return runBulkWrite(() => openConduitTable(context), config, body, 'update', context.get(formBodyContext))
    },

    async bulkReplace(context) {
      const config = requireConduitConfig(context)
      const body = context.get(jsonBodyContext)
      return runBulkWrite(() => openConduitTable(context), config, body, 'replace', context.get(formBodyContext))
    },

    async bulkDestroy(context) {
      const body = context.get(jsonBodyContext)
      const unknown = refuseUnknownMembers(body, ['ids'])
      if (unknown) return unknown
      const ids = extractIds(body)
      if (!ids) return problemResponse('invalid_body', { detail: 'Send {ids: [id, ...]} with one id or more.' })
      if (exceedsBulkLimit(ids.length)) return problemResponse('too_many_records', TOO_MANY_RECORDS)
      if (hasDuplicateIds(ids)) return problemResponse('duplicate_ids')

      // One deleteRecords call, so the batch is deleted entirely or not
      // at all.
      const table = await openConduitTable(context)
      const ok = await table.deleteRecords(ids)
      if (!ok) return problemResponse('record_not_found', { detail: 'An id does not exist. Nothing was deleted.' })
      return jsonResponse({ records: ids.map((id) => ({ id, deleted: true })) })
    },
  }
}

// A list read's cursor, opaque to callers: base64url of {v:1,c:<the
// source's own cursor>}, so a source can change what it puts inside
// without breaking clients. Returns null for anything else.
export function encodeListCursor(sourceCursor: string): string {
  return Buffer.from(JSON.stringify({ v: 1, c: sourceCursor })).toString('base64url')
}

export function decodeListCursor(cursor: string): string | null {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { v?: unknown; c?: unknown }
    return value.v === 1 && typeof value.c === 'string' ? value.c : null
  } catch {
    return null
  }
}
