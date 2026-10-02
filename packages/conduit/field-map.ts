import type { ConduitFields } from './sheets.ts'

// Maps a conduit's field names to the source's column names
// (suri_config.fieldMap) and back. Names not in fieldMap pass through
// unchanged. Applies to a record's `fields` only, never its `id`.

// A write named a field outside the conduit's schema. Thrown by
// ensureColumnsForWrite (sheets.ts) and checkKnownFields below;
// middleware/source-errors.ts in @conduits/gateway returns 400.
export class ConduitUnknownFieldError extends Error {
  constructor(
    public readonly source: string,
    public readonly fieldName: string,
  ) {
    super(`Unknown field: '${fieldName}'`)
  }
}

// Inbound: field names to column names, before writing.
export function toSourceFields(fields: ConduitFields, fieldMap: Record<string, string> | undefined): ConduitFields {
  if (!fieldMap) return fields
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [fieldMap[name] ?? name, value]))
}

// fieldMap reversed (column name -> field name), for toWidgetFields and
// the schema endpoint.
export function reverseFieldMap(fieldMap: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(fieldMap).map(([widget, source]) => [source, widget]))
}

// Outbound: column names to field names, for every response.
export function toWidgetFields(fields: ConduitFields, fieldMap: Record<string, string> | undefined): ConduitFields {
  if (!fieldMap) return fields
  const bySourceName = reverseFieldMap(fieldMap)
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [bySourceName[name] ?? name, value]))
}

// Rejects a field not in fieldMap, before toSourceFields on every write.
// An empty or missing fieldMap declares no schema and accepts anything.
// Separate from the header check in ensureColumnsForWrite (sheets.ts).
export function checkKnownFields(fields: ConduitFields, fieldMap: Record<string, string> | undefined, source: string): void {
  if (!fieldMap) return
  const declared = Object.keys(fieldMap)
  if (declared.length === 0) return
  for (const name of Object.keys(fields)) {
    if (!declared.includes(name)) throw new ConduitUnknownFieldError(source, name)
  }
}
