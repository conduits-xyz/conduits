import type { ConduitFields, ConduitRecord } from './sheets.ts'
import { createdTimeFromRowId } from './row-id.ts'

// The envelope every single-record response uses — separate from
// `fields` so a generic, dynamic-schema display component can enumerate
// a record's actual data columns (`Object.keys(record.fields)`) without
// a denylist for `id`/`createdTime`, and so a user's own column literally
// named `id` can never collide with ours. `createdTime` is derived from
// the id itself (see row-id.ts) rather than a separately persisted
// value — free, and always in sync with the id.
export interface WireRecord {
  id: string
  createdTime: string | null
  fields: ConduitFields
}

export function wrapRecord(record: ConduitRecord): WireRecord {
  return { id: record.id, createdTime: createdTimeFromRowId(record.id), fields: record.fields }
}

// A single-record body (`{fields}`) or a bulk body (`{records:
// [{fields}, ...]}`) on the very same create endpoint — same verb, same
// URL, the body's own shape decides which. Optimizes for the common
// case (one form, one record) staying maximally simple, while bulk is
// there without a second route to learn.
export function isBulkBody(body: unknown): body is { records: unknown[] } {
  return typeof body === 'object' && body !== null && Array.isArray((body as { records?: unknown }).records)
}

// Caps every bulk create/update/delete at 10 records per request — also
// the practical bound on how many ids row-id.ts's per-millisecond counter
// needs to disambiguate at once — a bulk create's ids are all generated
// in one synchronous loop before the single batched Sheets API call that
// writes them (sheets.ts's appendRows), so they routinely land in the
// same millisecond in production, not just in tests; the counter's
// headroom (31^3 ids/ms) is what actually makes that safe, this cap just
// keeps a batch nowhere near it.
export const MAX_BULK_RECORDS = 10

export function exceedsBulkLimit(count: number): boolean {
  return count > MAX_BULK_RECORDS
}

// A field value outside string/number/boolean/null doesn't fit
// ConduitFields as this contract is shaped (see INTEGRATIONS.md) — a
// nested object or array is rejected here rather than silently
// stringified, so a caller finds out immediately instead of getting back
// a mangled value it never asked for.
function isConduitFieldValue(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

export function extractFields(body: unknown): ConduitFields | null {
  if (typeof body !== 'object' || body === null) return null
  const fields = (body as { fields?: unknown }).fields
  if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) return null
  const entries = Object.entries(fields)
  if (!entries.every(([, value]) => isConduitFieldValue(value))) return null
  return Object.fromEntries(entries) as ConduitFields
}

// A caller can't assign their own id on create — ids are ours to generate.
// A create request carrying a top-level `id` (sibling of `fields`, not
// inside it) is invalid, not just ignored.
export function hasBodyId(body: unknown): boolean {
  return typeof body === 'object' && body !== null && 'id' in body
}

/**
 * Validates each entry of a `records` array has a well-formed `fields`
 * object. When `requireId` is true (update/replace), every entry must also
 * carry a non-empty `id`, and the result is real ConduitRecords ready for
 * updateRecords/replaceRecords. When false (create), no entry may carry
 * one — both directions are invalid per the documented spec, not just
 * "optional" — and the result is bare ConduitFields, ready for
 * createRecords (which, like ConduitRecord itself, has no id to give it).
 * The two overloads let a call site's literal `true`/`false` argument
 * pick the right return type at compile time, instead of every caller
 * needing an `id!` to paper over the other case's shape.
 */
export function extractBulkRecords(records: unknown[], requireId: true): ConduitRecord[] | null
export function extractBulkRecords(records: unknown[], requireId: false): ConduitFields[] | null
export function extractBulkRecords(records: unknown[], requireId: boolean): ConduitRecord[] | ConduitFields[] | null {
  const parsed: (ConduitRecord | ConduitFields)[] = []
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
  return parsed as ConduitRecord[] | ConduitFields[]
}

export function hasDuplicateIds(ids: string[]): boolean {
  return new Set(ids).size !== ids.length
}

// A bulk delete's ids travel in the JSON body (`{ids: [...]}`), like
// everything else in this API — not a query string, which would be the
// one place this API breaks its own "JSON in, JSON out" pattern.
export function extractIds(body: unknown): string[] | null {
  if (typeof body !== 'object' || body === null) return null
  const ids = (body as { ids?: unknown }).ids
  if (!Array.isArray(ids) || ids.length === 0) return null
  if (!ids.every((id): id is string => typeof id === 'string' && id !== '')) return null
  return ids
}
