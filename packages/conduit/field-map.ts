import type { ConduitFields } from './sheets.ts'

// Maps a conduit's field names to the source's column names
// (suri_config.fieldMap) and back. Names not in fieldMap pass through
// unchanged. Applies to a record's `fields` only, never its `id`.

// A write named fields outside the conduit's schema; `fieldNames` lists
// every one. Thrown by ensureColumnsForWrite (sheets.ts) and
// checkKnownFields below; middleware/source-errors.ts in
// @conduits/gateway returns 400 with one error per field.
export class ConduitUnknownFieldError extends Error {
  constructor(
    public readonly source: string,
    public readonly fieldNames: readonly string[],
  ) {
    super(`Unknown ${fieldNames.length === 1 ? 'field' : 'fields'}: ${fieldNames.map((name) => `'${name}'`).join(', ')}`)
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

// Rejects fields not in fieldMap, before toSourceFields on every write,
// naming all of them across the records. An empty or missing fieldMap
// declares no schema and accepts anything. Separate from the header
// check in ensureColumnsForWrite (sheets.ts).
export function checkKnownFields(fieldsList: ConduitFields[], fieldMap: Record<string, string> | undefined, source: string): void {
  if (!fieldMap) return
  const declared = Object.keys(fieldMap)
  if (declared.length === 0) return
  const unknown = [...new Set(fieldsList.flatMap((fields) => Object.keys(fields)))].filter((name) => !declared.includes(name))
  if (unknown.length > 0) throw new ConduitUnknownFieldError(source, unknown)
}
