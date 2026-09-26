import type { ConduitFields } from './sheets.ts'

// Translates between a conduit's widget-facing field names and the
// source's real column names (conduits.suri_config.fieldMap, see
// app/data/schema.ts) — kept out of sheets.ts deliberately, since that
// file's job is talking to Sheets, not presentation. A name absent from
// fieldMap passes through unchanged, so a conduit that never sets one
// behaves exactly as if this layer weren't there. Operates on just a
// ConduitRecord's `fields`, never `id` — id is bookkeeping the record
// shape already keeps separate, not a source column, so it was never a
// valid fieldMap target either direction.

// Thrown when a write submits a field name outside the conduit's schema
// — a generic conduit-domain error any suri_type can throw (sheets.ts's
// ensureColumnsForWrite; checkKnownFields below). packages/gateway/
// middleware/source-errors.ts maps it to a 400.
export class ConduitUnknownFieldError extends Error {
  constructor(
    public readonly source: string,
    public readonly fieldName: string,
  ) {
    super(`Unknown field: '${fieldName}'`)
  }
}

// Inbound: a submitted record's field names -> the source's real column
// names, before calling into a ConduitTable.
export function toSourceFields(fields: ConduitFields, fieldMap: Record<string, string> | undefined): ConduitFields {
  if (!fieldMap) return fields
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [fieldMap[name] ?? name, value]))
}

// fieldMap is stored widget-name -> source-name; both toWidgetFields and
// the schema endpoint (packages/gateway/controller.ts) need the reverse lookup —
// shared here instead of each rebuilding it its own way.
export function reverseFieldMap(fieldMap: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fieldMap).map(([widget, source]) => [source, widget]))
}

// Outbound: a record's fields read back from the source (real column
// names) -> the conduit's widget-facing field names, for every API
// response.
export function toWidgetFields(fields: ConduitFields, fieldMap: Record<string, string> | undefined): ConduitFields {
  if (!fieldMap) return fields
  const bySourceName = reverseFieldMap(fieldMap)
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [bySourceName[name] ?? name, value]))
}

// Rejects a field not present in fieldMap — called before toSourceFields
// on every write, for every suri_type. An empty or undefined fieldMap
// means no schema is declared, so anything is accepted. Independent of
// Sheets' own live-header check in ensureColumnsForWrite (sheets.ts).
export function checkKnownFields(fields: ConduitFields, fieldMap: Record<string, string> | undefined, source: string): void {
  if (!fieldMap) return
  const declared = Object.keys(fieldMap)
  if (declared.length === 0) return
  for (const name of Object.keys(fields)) {
    if (!declared.includes(name)) throw new ConduitUnknownFieldError(source, name)
  }
}
