import { parseGoogleRef } from '../google-ref.ts'
import type { SourceCompileResult } from '../source-compiler.ts'

// Validates a googleSheets `source:` block: the spreadsheet id (from
// `conduits sheets create`; see sheets-create.ts) becomes sourceKey, and
// suri_config carries `table` and `fieldMap`, which is all sheets.ts
// reads.
export function compileGoogleSheetsSource(raw: unknown, context: string): SourceCompileResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${context}: source must be a map`)
  }
  const source = raw as Record<string, unknown>

  if (typeof source.credential !== 'string') {
    throw new Error(`${context}: source.credential is required`)
  }
  // Format only; see google-ref.ts.
  parseGoogleRef(source.credential)

  if (typeof source.spreadsheetId !== 'string' || source.spreadsheetId === '') {
    throw new Error(`${context}: source.spreadsheetId is required (run: conduits sheets create)`)
  }
  if (source.sheet !== undefined && typeof source.sheet !== 'string') {
    throw new Error(`${context}: source.sheet must be a string`)
  }

  let fieldMap: Record<string, string> | undefined
  if (source.fieldMap !== undefined) {
    if (typeof source.fieldMap !== 'object' || source.fieldMap === null || Array.isArray(source.fieldMap)) {
      throw new Error(`${context}: source.fieldMap must be a map of field name -> column name`)
    }
    for (const [key, value] of Object.entries(source.fieldMap as Record<string, unknown>)) {
      if (typeof value !== 'string') throw new Error(`${context}: source.fieldMap.${key} must be a string`)
    }
    fieldMap = source.fieldMap as Record<string, string>
  }

  return {
    suriObjectKey: source.spreadsheetId,
    suriConfig: { table: source.sheet as string | undefined, fieldMap },
    credentialRef: source.credential,
  }
}
