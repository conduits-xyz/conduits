import type { GatewayContext } from './context.ts'
import type { GatewayDeps } from './pipeline.ts'
import { jsonResponse, problemResponse } from './response.ts'
import type { ConduitTable } from '@conduits/conduit'
import { formBodyContext, jsonBodyContext } from './middleware/body.ts'
import { openConduitTable, requireConduitConfig } from './require-context.ts'
import { checkHiddenFormField } from './middleware/hidden-form-field.ts'
import { honeypotDropCountContext } from './observation.ts'
import { refuseUnknownMembers } from './request-members.ts'
import { checkFieldValues, toStoredFields } from './field-values.ts'
import { bulkCondition, extractEtags } from './conditions.ts'
import { recordResponse, toWireRecord } from './etag.ts'
import type { ConduitConfig } from './types.ts'
import {
  createRowIdMaker,
  type ConduitRecord,
  type ConduitFields,
  checkKnownFields,
  isBulkBody,
  extractFields,
  extractBulkRecords,
  extractIds,
  hasBodyId,
  hasDuplicateIds,
  MAX_BULK_RECORDS,
  type RequestFields,
  type WireRecord,
} from '@conduits/conduit'

// A refusal for a bulk write of more than MAX_BULK_RECORDS, or null.
function tooManyRecords(count: number): Response | null {
  return count > MAX_BULK_RECORDS ? problemResponse('too_many_records', { detail: `Send ${MAX_BULK_RECORDS} records or ids or fewer.` }) : null
}

// Callers can't set an id on create, one record or several
// (record-shape.ts).
const ID_ON_CREATE = { detail: 'The gateway makes the id of a new record.' }

// The members of each item of `records`. An id on a created record is
// refused as id_not_allowed (ID_ON_CREATE); an etag is only for a record
// that is changed.
const RECORD_MEMBERS = ['id', 'fields']
const CHANGED_RECORD_MEMBERS = ['id', 'etag', 'fields']
const INVALID_ETAGS = { detail: 'An etag must be the ETag of the record, as a string.' }

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

// A created email's response: an email sent is not a record the caller
// can read back as it was sent, so it has no ETag.
function sentEmailResponse(record: { etag: string } & WireRecord): Response {
  const { etag: _etag, ...wire } = record
  return jsonResponse(wire, 201)
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
  const unknown = refuseUnknownMembers(body, ['records'], CHANGED_RECORD_MEMBERS)
  if (unknown) return unknown
  const tooMany = tooManyRecords(body.records.length)
  if (tooMany) return tooMany
  const entries = extractBulkRecords(body.records, true)
  if (!entries) return problemResponse('invalid_body', { detail: 'Each record needs an id and fields.' })
  const ids = entries.map((entry) => entry.id)
  if (hasDuplicateIds(ids)) return problemResponse('duplicate_ids')
  const etags = extractEtags(body.records.map((record) => (record as { etag?: unknown }).etag))
  if (!etags) return problemResponse('invalid_body', INVALID_ETAGS)
  const condition = bulkCondition(ids, etags, config)
  if (condition instanceof Response) return condition

  checkKnownFields(entries.map((entry) => entry.fields), config.suriConfig.fieldMap, config.suriType)
  const checked = checkFieldValues(entries.map((entry) => entry.fields), config, { bulk: true, form })
  if (checked instanceof Response) return checked
  const toWrite: ConduitRecord[] = entries.map((entry, i) => ({ id: entry.id, fields: toStoredFields(checked[i]!, config) }))

  const table = await openTable()
  const written = mode === 'update' ? await table.updateRecords(toWrite, condition) : await table.replaceRecords(toWrite, condition)
  if (written === null) return problemResponse('record_not_found', { detail: 'An id does not exist. Nothing was written.' })
  return jsonResponse({ records: written.map((record) => toWireRecord(record, config)) })
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
  // A record a hidden form field dropped looks like a stored one.
  const droppedRecord = (fields: RequestFields, config: ConduitConfig) => toWireRecord({ id: makeRowId(), fields: toStoredFields(fields, config) }, config)
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
        records: records.map((record) => toWireRecord(record, config)),
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
        const tooMany = tooManyRecords(body.records.length)
        if (tooMany) return tooMany
        const unknown = refuseUnknownMembers(body, ['records'], RECORD_MEMBERS)
        if (unknown) return unknown
        if (body.records.some(hasBodyId)) return problemResponse('id_not_allowed', ID_ON_CREATE)
        const entries = extractBulkRecords(body.records, false)
        if (!entries) return problemResponse('invalid_body', { detail: 'Each record needs fields.' })

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
        const records = outcomes.map((outcome) =>
          outcome.outcome === 'dropped' ? droppedRecord(outcome.fields, config) : toWireRecord(appended[cursor++]!, config),
        )
        const droppedCount = outcomes.filter((outcome) => outcome.outcome === 'dropped').length
        recordHoneypotDrops(context, droppedCount)
        return jsonResponse({ records }, 201)
      }

      const sendsEmail = deps.sourceClients[config.suriType]?.capabilities().sendsEmail ?? false
      if (hasBodyId(body)) return problemResponse('id_not_allowed', ID_ON_CREATE)
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
        const dropped = droppedRecord(outcome.fields, config)
        return sendsEmail ? sentEmailResponse(dropped) : jsonResponse(dropped, 201, { etag: dropped.etag })
      }

      checkKnownFields([outcome.fields], config.suriConfig.fieldMap, config.suriType)
      const checked = checkFieldValues([outcome.fields], config, { bulk: false, form: context.get(formBodyContext) })
      if (checked instanceof Response) return checked
      if (sendsEmail && deps.runtime.allowSend && !(await deps.runtime.allowSend(config))) {
        return problemResponse('send_limit_reached', { detail: "This conduit's owner can send no more email today." })
      }
      const record = await (await openConduitTable(context)).createRecord(toStoredFields(checked[0]!, config))
      if (redirectTarget) return Response.redirect(redirectTarget, 303)
      if (sendsEmail) return sentEmailResponse(toWireRecord(record, config))
      return recordResponse(record, config, 201)
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
      const unknown = refuseUnknownMembers(body, ['ids', 'etags'])
      if (unknown) return unknown
      const ids = extractIds(body)
      if (!ids) return problemResponse('invalid_body', { detail: 'Send {ids: [id, ...]} with one id or more.' })
      const tooMany = tooManyRecords(ids.length)
      if (tooMany) return tooMany
      if (hasDuplicateIds(ids)) return problemResponse('duplicate_ids')
      const sent = body.etags
      const etags = sent === undefined ? ids.map(() => undefined) : Array.isArray(sent) && sent.length === ids.length ? extractEtags(sent) : null
      if (!etags) return problemResponse('invalid_body', { detail: 'Send etags as a list with one ETag for each id, in the same order.' })
      const condition = bulkCondition(ids, etags, requireConduitConfig(context))
      if (condition instanceof Response) return condition

      // One deleteRecords call, so the batch is deleted entirely or not
      // at all.
      const table = await openConduitTable(context)
      const ok = await table.deleteRecords(ids, condition)
      if (!ok) return problemResponse('record_not_found', { detail: 'An id does not exist. Nothing was deleted.' })
      return jsonResponse({ records: ids.map((id) => ({ id, deleted: true })) })
    },
  }
}

// A list read's cursor, opaque to callers: base64url of {v:1,c:<the
// source's own cursor>}, so a source can change what it puts inside
// without breaking clients. Returns null for anything else.
function encodeListCursor(sourceCursor: string): string {
  return Buffer.from(JSON.stringify({ v: 1, c: sourceCursor })).toString('base64url')
}

function decodeListCursor(cursor: string): string | null {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { v?: unknown; c?: unknown }
    return value.v === 1 && typeof value.c === 'string' ? value.c : null
  } catch {
    return null
  }
}
