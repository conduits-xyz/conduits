import type { FieldValue, RequestFields } from './field-schema.ts'
import { createdTimeFromRowId } from './row-id.ts'

// A record as a client sends one to update or replace it.
export interface RequestRecord {
  id: string
  fields: RequestFields
}

// The single-record response. Data is under `fields`, so a display can
// list Object.keys(record.fields) without filtering `id` or
// `createdTime`, and a user column named `id` can't collide.
// `createdTime` is derived from the id (row-id.ts).
export interface WireRecord {
  id: string
  createdTime: string | null
  fields: RequestFields
}

export function wrapRecord(record: RequestRecord): WireRecord {
  return { id: record.id, createdTime: createdTimeFromRowId(record.id), fields: record.fields }
}

// A create body is one record (`{fields}`) or several (`{records:
// [{fields}, ...]}`) on the same endpoint; the shape decides.
export function isBulkBody(body: unknown): body is { records: unknown[] } {
  return typeof body === 'object' && body !== null && Array.isArray((body as { records?: unknown }).records)
}

// At most 10 records per bulk request. A bulk create's ids are generated
// in one loop, often in the same millisecond; row-id.ts's counter allows
// 31^3 ids per millisecond, far above this.
export const MAX_BULK_RECORDS = 10

export function exceedsBulkLimit(count: number): boolean {
  return count > MAX_BULK_RECORDS
}

// Values must be string, number, boolean, null or a list of strings, the
// last for a multi_select field only (field-schema.ts). Objects and other
// lists are rejected rather than stringified.
function isFieldValue(value: unknown): value is FieldValue {
  if (Array.isArray(value)) return value.every((item) => typeof item === 'string')
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

export function extractFields(body: unknown): RequestFields | null {
  if (typeof body !== 'object' || body === null) return null
  const fields = (body as { fields?: unknown }).fields
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return null
  const entries = Object.entries(fields)
  if (!entries.every(([, value]) => isFieldValue(value))) return null
  return Object.fromEntries(entries) as RequestFields
}

// Callers can't set an id on create: a top-level `id` beside `fields`
// makes the request invalid.
export function hasBodyId(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'id' in body
}

/**
 * Checks each entry of a `records` array has a `fields` object. With
 * `requireId` (update, replace) each entry must have a non-empty `id`
 * and the result is RequestRecords; without it (create) no entry may
 * have one and the result is RequestFields. The overloads give each
 * call the right return type.
 */
export function extractBulkRecords(records: unknown[], requireId: true): RequestRecord[] | null
export function extractBulkRecords(records: unknown[], requireId: false): RequestFields[] | null
export function extractBulkRecords(records: unknown[], requireId: boolean): RequestRecord[] | RequestFields[] | null {
  const parsed: (RequestRecord | RequestFields)[] = []
  for (const entry of records) {
    const fields = extractFields(entry)
    if (!fields) return null
    const rawId = (entry as { id?: unknown }).id
    if (requireId) {
      if (typeof rawId !== 'string' || rawId === '') return null
      parsed.push({ id: rawId, fields })
    } else {
      if (rawId !== undefined) return null
      parsed.push(fields)
    }
  }
  return parsed as RequestRecord[] | RequestFields[]
}

export function hasDuplicateIds(ids: string[]): boolean {
  return new Set(ids).size !== ids.length
}

// Bulk delete ids are sent in the JSON body (`{ids: [...]}`), like every
// other request.
export function extractIds(body: unknown): string[] | null {
  if (typeof body !== 'object' || body === null) return null
  const ids = (body as { ids?: unknown }).ids
  if (!Array.isArray(ids) || ids.length === 0) return null
  if (!ids.every((id): id is string => typeof id === 'string' && id !== '')) return null
  return ids
}
