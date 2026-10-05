import { createHash } from 'node:crypto'
import { randomRowId } from './row-id.ts'
import { ConduitUnknownFieldError } from './field-map.ts'

export { randomRowId } from './row-id.ts'

// The `source` on errors this client throws.
const SOURCE = 'googleSheets'

// open() receives the conduit's suri_config as JSON; Sheets uses only
// `.table`. A missing or malformed config means the first tab.
function tableFromConfig(config: string | undefined): string | undefined {
  if (!config) return undefined
  try {
    const parsed: unknown = JSON.parse(config)
    const table = (parsed as { table?: unknown } | null)?.table
    return typeof table === 'string' ? table : undefined
  } catch {
    return undefined
  }
}

// Conduit errors. Every integration throws these rather than its own
// error classes, so the gateway's error handler
// (middleware/source-errors.ts) needn't know the integrations. `source`
// names the integration that failed.

// The source rejected the credential (a 401): the owner must reconnect.
// Kept apart from other failures, which the gateway handles differently.
export class ConduitAuthError extends Error {
  constructor(
    public readonly source: string,
    message: string,
  ) {
    super(message)
  }
}

// Any other non-2xx from the source (a deleted table, a 5xx, a bad
// range). source-errors.ts turns it into a JSON 502; a plain Error is
// left alone as a bug.
export class ConduitSourceError extends Error {
  constructor(
    public readonly source: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

// The source, or this process's budget for it, refused the request for
// now; retry after `retryAfterSeconds`. The gateway answers 503 with
// Retry-After.
export class ConduitRateLimitError extends ConduitSourceError {
  constructor(
    source: string,
    message: string,
    public readonly retryAfterSeconds: number,
  ) {
    super(source, message, 429)
  }
}

// --- The contract (see INTEGRATIONS.md) ---

export type ConduitFieldType = 'string' | 'number' | 'boolean' | 'date'

export type ConduitFields = Record<string, string | number | boolean | null>

// A record always has an id; create input without one is plain
// ConduitFields.
export type ConduitRecord = {
  id: string
  fields: ConduitFields
}

// Every method a conduit can allow, in display order. A management UI
// shows all of them and disables those a source's capabilities().methods
// lacks. Not a list of allowed methods.
export const ALL_HTTP_METHODS: readonly string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

// Facts about an integration that hold for every table or mailbox it
// opens. See INTEGRATIONS.md.
export interface ConduitSourceCapabilities {
  // The methods in ALL_HTTP_METHODS this integration supports.
  methods: readonly string[]
  // Whether a bulk create ({records: [...]}) is safe. Sheets: yes, one
  // atomic API call. Fastmail and Gmail send each record as an email
  // that can't be unsent, so a partly failed batch would be resent on
  // retry: false. Only create needs this; bulk replace, update and
  // delete are addressed by id, so retrying them is safe.
  bulkCreate: boolean
}

export interface ConduitSourceClient {
  // fetchImpl defaults to the global fetch. A caller that counts
  // provider bytes passes its own (GatewayRuntime.instrumentFetch).
  connect(sourceKey: string, credential: string, fetchImpl?: typeof fetch): Promise<ConduitSource>
  disconnect(source: ConduitSource): Promise<void>

  // Synchronous and needs no connection, so forms and save-time checks
  // can use it before any credential exists.
  capabilities(): ConduitSourceCapabilities
}

export interface ConduitSource {
  listTables(): Promise<string[]>
  // The conduit's suri_config as stored, JSON-encoded (see
  // middleware/source-client.ts). Each integration reads its own keys:
  // Sheets `.table`, Fastmail `recipients` and `subject`.
  open(config?: string): ConduitTable
}

export interface ConduitTable {
  describeFields(): Promise<Array<{ name: string; type: ConduitFieldType; nullable: boolean }>>
  listRecords(page?: { cursor?: string; limit?: number }): Promise<{
    records: ConduitRecord[]
    nextCursor: string | null
  }>

  // An owner action that defines a column. Writes never create columns
  // (see ensureColumnsForWrite). `type` is for sources with typed
  // columns; Sheets ignores it. A source with a fixed schema (a mailbox)
  // throws ConduitSourceError. See INTEGRATIONS.md.
  createField(name: string, type?: ConduitFieldType): Promise<void>
  createFields(fields: Array<{ name: string; type?: ConduitFieldType }>): Promise<void>

  // An owner action that deletes a column (not a declared field). A name
  // that isn't a column is ignored. Sources without deletable columns
  // (Gmail, Fastmail) throw ConduitSourceError.
  deleteField(name: string): Promise<void>
  deleteFields(names: string[]): Promise<void>

  createRecord(fields: ConduitFields): Promise<ConduitRecord>
  createRecords(fieldsList: ConduitFields[]): Promise<ConduitRecord[]>

  replaceRecord(record: ConduitRecord): Promise<ConduitRecord | null>
  replaceRecords(records: ConduitRecord[]): Promise<ConduitRecord[] | null>

  updateRecord(record: ConduitRecord): Promise<ConduitRecord | null>
  updateRecords(records: ConduitRecord[]): Promise<ConduitRecord[] | null>

  deleteRecord(id: string): Promise<boolean>
  deleteRecords(ids: string[]): Promise<boolean>
}

// --- Internal working shape ---
//
// The helpers below work on a flat all-string row with the id under
// `id`, which is what a Sheets row is. The ConduitTable methods convert
// to and from ConduitRecord.
type FlatRow = Record<string, string>

function toConduitRecord(row: FlatRow, schema: Map<string, ConduitFieldType>): ConduitRecord {
  const { id, ...rest } = row
  const fields: ConduitFields = {}
  for (const [name, raw] of Object.entries(rest)) {
    fields[name] = coerceValue(raw, schema.get(name) ?? 'string')
  }
  return { id, fields }
}

function coerceValue(raw: string, type: ConduitFieldType): string | number | boolean | null {
  if (raw === '') return null
  if (type === 'number') return Number(raw)
  if (type === 'boolean') return raw === 'TRUE'
  return raw // 'string', and 'date' (an ISO-8601 string)
}

function stringifyValue(value: string | number | boolean | null): string {
  if (value === null) return ''
  return typeof value === 'string' ? value : String(value)
}

function fieldsToFlatRow(fields: ConduitFields): FlatRow {
  const row: FlatRow = {}
  for (const [name, value] of Object.entries(fields)) {
    row[name] = stringifyValue(value)
  }
  return row
}

function fromConduitRecord(record: ConduitRecord): FlatRow {
  return { id: record.id, ...fieldsToFlatRow(record.fields) }
}

const NUMBER_RE = /^-?\d+(\.\d+)?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/

// A column is typed only if every non-blank value agrees; one text value
// makes it 'string'. Dates are tested before numbers; no value matches
// both.
export function inferColumnType(values: string[]): ConduitFieldType {
  const nonBlank = values.filter((v) => v !== '')
  if (nonBlank.length === 0) return 'string'
  if (nonBlank.every((v) => DATE_RE.test(v))) return 'date'
  if (nonBlank.every((v) => NUMBER_RE.test(v))) return 'number'
  if (nonBlank.every((v) => v === 'TRUE' || v === 'FALSE')) return 'boolean'
  return 'string'
}

// Inferred once per grid read.
function inferSchema(header: string[], dataRows: string[][]): Map<string, ConduitFieldType> {
  const schema = new Map<string, ConduitFieldType>()
  header.forEach((name, i) => {
    if (name === ID_COLUMN_NAME) return
    schema.set(name, inferColumnType(dataRows.map((row) => row[i] ?? '')))
  })
  return schema
}

// --- Client: Google Sheets API v4 over fetch() ---
//
// The first row is the header. Rows are addressed by an ID_COLUMN_NAME
// column, which the first write adds as the last column if the sheet
// doesn't have one; after that it is found wherever it is. It isn't
// called `id` so it can't be confused with a column of the user's
// named "id" or "ID". The API still calls the field `id`.
//
// A range without a sheet name applies to the first tab, the default
// when no table is set.
//
// The Sheets API can't update "the row where id = X": each write reads
// the grid to find the row number, then writes that range. There is no
// compare-and-swap, so a write racing a delete on the same row can go
// wrong.
//
// Deletes remove the row (deleteDimension) rather than leave a blank
// one. Row numbers are found immediately before each write and never
// cached.
//
// Each bulk method makes one grid read and one write call for the whole
// batch. spreadsheets.batchUpdate and values.batchUpdate are atomic, so
// a bad record fails the whole batch, and a batch costs two API calls
// rather than up to MAX_BULK_RECORDS.
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
// Reads take every row; appends name a range only to anchor the table.
const READ_RANGE = 'A:ZZ'
const APPEND_RANGE = 'A1:ZZ10000'

async function sheetsFetch(
  path: string,
  credential: string,
  init?: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  return fetchImpl(`${SHEETS_API}/${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
  })
}

// Google's error message from a non-2xx body ({error: {code, message,
// status}}), or undefined when the body is empty, not JSON or shaped
// otherwise.
async function extractGoogleErrorMessage(response: Response): Promise<string | undefined> {
  let text: string
  try {
    text = await response.text()
  } catch {
    return undefined
  }
  if (!text) return undefined

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return undefined
  }

  const message = (body as { error?: { message?: unknown } } | null)?.error?.message
  return typeof message === 'string' && message !== '' ? message : undefined
}

async function throwForStatus(response: Response, action: string): Promise<void> {
  if (response.ok) return
  const detail = await extractGoogleErrorMessage(response)
  if (response.status === 401) {
    throw new ConduitAuthError(SOURCE, `Sheets ${action} failed: access token rejected (401)${detail ? ` — ${detail}` : ''}`)
  }
  if (response.status === 429) {
    // Google's quotas refill each minute.
    throw new ConduitRateLimitError(SOURCE, `Sheets ${action} refused by Google's quota (429)${detail ? `: ${detail}` : ''}`, 60)
  }
  throw new ConduitSourceError(SOURCE, `Sheets ${action} failed (${response.status})${detail ? `: ${detail}` : ''}`, response.status)
}

// Always single-quoted (with quotes doubled) for A1 notation; Sheets
// accepts quotes even where they aren't needed.
function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

function rangeFor(tableName: string | undefined, a1Range: string): string {
  return tableName ? `${quoteSheetName(tableName)}!${a1Range}` : a1Range
}

async function getGrid(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string[][]> {
  const response = await sheetsFetch(`${sourceKey}/values/${rangeFor(tableName, READ_RANGE)}`, credential, undefined, fetchImpl)
  await throwForStatus(response, 'read')
  const body = (await response.json()) as { values?: string[][] }
  return body.values ?? []
}

// The tab's numeric id (gid), which deleteDimension and tab links need.
// Falls back to the first tab when `tableName` is unset or not found;
// callers read the grid first, which already fails for an unknown tab.
export async function getSheetId(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const response = await sheetsFetch(`${sourceKey}?fields=sheets.properties(sheetId,title)`, credential, undefined, fetchImpl)
  await throwForStatus(response, 'read sheet metadata')
  const body = (await response.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] }
  const sheets = body.sheets ?? []
  const named = tableName ? sheets.find((sheet) => sheet.properties?.title === tableName) : undefined
  return named?.properties?.sheetId ?? sheets[0]?.properties?.sheetId ?? 0
}

// The sheet's id column (see above for why it isn't `id`).
export const ID_COLUMN_NAME = 'conduit-id'

export function idColumnIndex(header: string[]): number {
  return header.indexOf(ID_COLUMN_NAME)
}

// 1-indexed: 1 is A.
export function columnToLetter(column: number): string {
  let letter = ''
  let col = column
  while (col > 0) {
    const remainder = (col - 1) % 26
    letter = String.fromCharCode(remainder + 65) + letter
    col = Math.floor((col - remainder - 1) / 26)
  }
  return letter
}

// A grid row as a FlatRow, with ID_COLUMN_NAME renamed to `id`. Every
// grid-to-FlatRow conversion goes through here, so "conduit-id" never
// appears among the fields.
export function rowToFields(header: string[], row: string[]): FlatRow {
  return Object.fromEntries(header.map((name, i) => [name === ID_COLUMN_NAME ? 'id' : name, row[i] ?? '']))
}

// Rows with an id. Rows with a blank id, or every row when the sheet has
// no id column, aren't records yet and are left out.
export function rowsFromGrid(grid: string[][]): FlatRow[] {
  const [header, ...dataRows] = grid
  if (!header) return []
  return dataRows.map((row) => rowToFields(header, row)).filter((row) => Boolean(row.id))
}

function gridRowFromFields(header: string[], fields: FlatRow): string[] {
  return header.map((name) => (name === ID_COLUMN_NAME ? (fields.id ?? '') : (fields[name] ?? '')))
}

function findRowIndex(grid: string[][], idIndex: number, id: string): number {
  return grid.findIndex((row, i) => i > 0 && row[idIndex] === id)
}

// Every field name in a batch except `id`, so the schema is checked
// once per batch.
function unionFieldNames(rows: Record<string, unknown>[]): string[] {
  return [...new Set(rows.flatMap((row) => Object.keys(row).filter((name) => name !== 'id')))]
}

// Makes sure the sheet has the columns a write needs. The id column is
// always added if missing, and existing rows get generated ids so they
// can be addressed. Field columns are added only while the sheet has no
// field columns yet (a new sheet); once it has any, an unknown field is
// rejected with ConduitUnknownFieldError rather than changing the
// user's sheet. Owners add columns with createField/createFields or by
// typing a header. New columns are appended, so nothing shifts. Makes no
// request when nothing is missing.
//
// `fieldNames` covers the whole write: Object.keys(fields) for one
// record, unionFieldNames(...) for a batch.
async function ensureColumnsForWrite(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  grid: string[][],
  fieldNames: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<string[][]> {
  const header = grid[0] ?? []

  const needsIdColumn = idColumnIndex(header) === -1
  const missingFieldNames = fieldNames.filter((name) => name !== 'id' && !header.includes(name))

  const hasAnyFieldColumn = header.some((name) => name !== ID_COLUMN_NAME)
  if (hasAnyFieldColumn && missingFieldNames.length > 0) {
    throw new ConduitUnknownFieldError(SOURCE, missingFieldNames)
  }

  const newColumnNames = needsIdColumn ? [ID_COLUMN_NAME, ...missingFieldNames] : missingFieldNames
  return addColumnsToGrid(sourceKey, tableName, credential, grid, newColumnNames, fetchImpl)
}

// Appends header columns and backfills ids for existing rows. Used by
// ensureColumnsForWrite (which decides whether columns may be added) and
// createFieldsOnSheet (an owner action, always allowed).
async function addColumnsToGrid(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  grid: string[][],
  newColumnNames: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<string[][]> {
  const header = grid[0] ?? []
  const dataRows = grid.slice(1)
  if (newColumnNames.length === 0) return grid

  const backfillIds = dataRows.map(() => randomRowId())

  const data = newColumnNames.flatMap((columnName, offset) => {
    const columnLetter = columnToLetter(header.length + offset + 1)
    const headerCell = { range: rangeFor(tableName, `${columnLetter}1`), values: [[columnName]] }
    if (columnName !== ID_COLUMN_NAME) return [headerCell]
    return [
      headerCell,
      ...backfillIds.map((id, i) => ({ range: rangeFor(tableName, `${columnLetter}${i + 2}`), values: [[id]] })),
    ]
  })

  const response = await sheetsFetch(
    `${sourceKey}/values:batchUpdate`,
    credential,
    { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) },
    fetchImpl,
  )
  await throwForStatus(response, 'add columns')

  const newHeader = [...header, ...newColumnNames]
  const newDataRows = dataRows.map((row, i) => [
    ...row,
    ...newColumnNames.map((columnName) => (columnName === ID_COLUMN_NAME ? backfillIds[i] : '')),
  ])
  return [newHeader, ...newDataRows]
}

// createField/createFields: adds whatever columns are missing, ignores
// existing ones, and refuses the reserved id column name.
async function createFieldsOnSheet(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  fields: Array<{ name: string; type?: ConduitFieldType }>,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const names = fields.map((field) => field.name)
  if (names.includes(ID_COLUMN_NAME)) {
    throw new Error(`"${ID_COLUMN_NAME}" is reserved and can't be used as a field name`)
  }

  const grid = await getGrid(sourceKey, tableName, credential, fetchImpl)
  const header = grid[0] ?? []
  const newColumnNames = names.filter((name) => !header.includes(name))
  await addColumnsToGrid(sourceKey, tableName, credential, grid, newColumnNames, fetchImpl)

  // Clear the cached field list so the next describeFields sees the new
  // column.
  sheetMetadata.invalidate(`fields\0${tabKey(sourceKey, tableName, credential)}`)
}

// listTables and describeFields are called as someone switches tabs
// while setting up a conduit. Their results are cached per spreadsheet
// and tab for 30 seconds, to absorb those bursts without serving stale
// lists for long.
const SHEET_METADATA_CACHE_TTL_MS = 30_000

// Values by key for `ttlMs`: this metadata, and list reads' grids
// (createHttpSheetsClient's readCacheMs). A load in flight is shared; a
// failed one isn't kept.
class TtlCache<T> {
  private readonly entries = new Map<string, { value: Promise<T>; expiresAt: number }>()

  constructor(private readonly ttlMs: number) {}

  get(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now()
    for (const [k, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(k)
    const hit = this.entries.get(key)
    if (hit) return hit.value
    const value = load()
    this.entries.set(key, { value, expiresAt: now + this.ttlMs })
    value.catch(() => this.entries.delete(key))
    return value
  }

  // Drops every key that starts with `prefix`.
  invalidate(prefix: string): void {
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key)
  }
}

const sheetMetadata = new TtlCache<unknown>(SHEET_METADATA_CACHE_TTL_MS)
const cached = <T>(key: string, load: () => Promise<T>) => sheetMetadata.get(key, load) as Promise<T>

// Cache keys include a digest of the access token, so one credential's
// results are never served to another. The digest is never sent or
// logged.
function tokenDigest(credential: string): string {
  return createHash('sha256').update(credential).digest('hex').slice(0, 16)
}

// One tab's key in either cache.
const tabKey = (sourceKey: string, tableName: string | undefined, credential: string) =>
  `${sourceKey}\0${tableName ?? ''}\0${tokenDigest(credential)}`

// One grid read and one values.append for the whole batch.
async function appendRows(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  fieldsList: FlatRow[],
  fetchImpl: typeof fetch = fetch,
): Promise<FlatRow[]> {
  const grid = await ensureColumnsForWrite(
    sourceKey,
    tableName,
    credential,
    await getGrid(sourceKey, tableName, credential, fetchImpl),
    unionFieldNames(fieldsList),
    fetchImpl,
  )
  const header = grid[0]
  const rows = fieldsList.map((fields) => ({ ...fields, id: randomRowId() }))
  const response = await sheetsFetch(
    `${sourceKey}/values/${rangeFor(tableName, APPEND_RANGE)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    credential,
    { method: 'POST', body: JSON.stringify({ values: rows.map((row) => gridRowFromFields(header, row)) }) },
    fetchImpl,
  )
  await throwForStatus(response, 'append')
  return rows
}

// Finds every entry's row from one grid read, merges each with its
// existing row via `merge`, adds columns for the batch, and writes all
// ranges in one values.batchUpdate. Returns null and writes nothing if
// any id isn't found, so the batch is atomic.
//
// Also returns the schema inferred from that grid, which updateRecord
// needs for fields carried over from the existing row.
async function bulkWriteRows(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  entries: FlatRow[],
  merge: (existing: FlatRow, fields: FlatRow) => FlatRow,
  fetchImpl: typeof fetch = fetch,
): Promise<{ rows: FlatRow[]; schema: Map<string, ConduitFieldType> } | null> {
  let grid = await getGrid(sourceKey, tableName, credential, fetchImpl)
  const header = grid[0]
  if (!header) return null

  const idIndex = idColumnIndex(header)
  if (idIndex === -1) return null // no id column yet means nothing has ever been assigned this id

  const rowIndexes: number[] = []
  for (const entry of entries) {
    const rowIndex = findRowIndex(grid, idIndex, entry.id)
    if (rowIndex === -1) return null
    rowIndexes.push(rowIndex)
  }

  const merged = entries.map((entry, i) => ({
    ...merge(rowToFields(header, grid[rowIndexes[i]]), entry),
    id: entry.id,
  }))

  // Row indexes stay valid: only columns are added.
  grid = await ensureColumnsForWrite(sourceKey, tableName, credential, grid, unionFieldNames(merged), fetchImpl)

  const data = merged.map((fields, i) => ({
    range: rangeFor(tableName, `A${rowIndexes[i] + 1}:ZZ${rowIndexes[i] + 1}`),
    values: [gridRowFromFields(grid[0], fields)],
  }))

  const response = await sheetsFetch(
    `${sourceKey}/values:batchUpdate`,
    credential,
    { method: 'POST', body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }) },
    fetchImpl,
  )
  await throwForStatus(response, 'bulk write')
  return { rows: merged, schema: inferSchema(grid[0], grid.slice(1)) }
}

// Finds every id's row from one grid read, then deletes them in one
// batchUpdate. Returns false and deletes nothing if any id isn't found.
// Deletes in one batchUpdate apply in order and shift the rows below
// up, so they are sent from the highest row down.
async function deleteRows(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  ids: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const grid = await getGrid(sourceKey, tableName, credential, fetchImpl)
  const idIndex = idColumnIndex(grid[0] ?? [])
  if (idIndex === -1) return false // no id column yet means nothing has ever been assigned this id

  const rowIndexes: number[] = []
  for (const id of ids) {
    const rowIndex = findRowIndex(grid, idIndex, id)
    if (rowIndex === -1) return false
    rowIndexes.push(rowIndex)
  }

  const sheetId = await getSheetId(sourceKey, tableName, credential, fetchImpl)
  const requests = [...rowIndexes]
    .sort((a, b) => b - a)
    .map((rowIndex) => ({
      deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } },
    }))

  const response = await sheetsFetch(
    `${sourceKey}:batchUpdate`,
    credential,
    { method: 'POST', body: JSON.stringify({ requests }) },
    fetchImpl,
  )
  await throwForStatus(response, 'bulk delete')
  return true
}

// Deletes columns as deleteRows deletes rows: one header read, one
// batchUpdate, highest column first. A name that isn't a column is
// skipped.
async function deleteFieldsOnSheet(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  names: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const grid = await getGrid(sourceKey, tableName, credential, fetchImpl)
  const header = grid[0] ?? []
  const columnIndexes = names
    .map((name) => header.indexOf(name))
    .filter((index) => index !== -1)
  if (columnIndexes.length === 0) return

  const sheetId = await getSheetId(sourceKey, tableName, credential, fetchImpl)
  const requests = [...columnIndexes]
    .sort((a, b) => b - a)
    .map((columnIndex) => ({
      deleteDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: columnIndex, endIndex: columnIndex + 1 } },
    }))

  const response = await sheetsFetch(
    `${sourceKey}:batchUpdate`,
    credential,
    { method: 'POST', body: JSON.stringify({ requests }) },
    fetchImpl,
  )
  await throwForStatus(response, 'delete columns')

  // Clear the cached field list, as in createFieldsOnSheet.
  sheetMetadata.invalidate(`fields\0${tabKey(sourceKey, tableName, credential)}`)
}

function bulkReplaceRows(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  entries: FlatRow[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ rows: FlatRow[]; schema: Map<string, ConduitFieldType> } | null> {
  return bulkWriteRows(sourceKey, tableName, credential, entries, (_existing, fields) => fields, fetchImpl)
}

function bulkUpdateRows(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  entries: FlatRow[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ rows: FlatRow[]; schema: Map<string, ConduitFieldType> } | null> {
  return bulkWriteRows(
    sourceKey,
    tableName,
    credential,
    entries,
    (existing, fields) => ({ ...existing, ...fields }),
    fetchImpl,
  )
}

// The ConduitTable for one spreadsheet and tab. No I/O until a method
// is called.
function openHttpTable(
  sourceKey: string,
  credential: string,
  tableName: string | undefined,
  fetchImpl: typeof fetch = fetch,
  gridCache?: TtlCache<string[][]>,
): ConduitTable {
  const table: ConduitTable = {
    async describeFields() {
      return cached(`fields\0${tabKey(sourceKey, tableName, credential)}`, async () => {
        const grid = await getGrid(sourceKey, tableName, credential, fetchImpl)
        const [header, ...dataRows] = grid
        if (!header) return []
        const schema = inferSchema(header, dataRows)
        return header
          .filter((name) => name && name !== ID_COLUMN_NAME)
          .map((name) => ({ name, type: schema.get(name) ?? 'string', nullable: true }))
        // Any Sheets cell can be blank.
      })
    },

    async createField(name, type) {
      return createFieldsOnSheet(sourceKey, tableName, credential, [{ name, type }], fetchImpl)
    },
    async createFields(fields) {
      return createFieldsOnSheet(sourceKey, tableName, credential, fields, fetchImpl)
    },
    async deleteField(name) {
      return deleteFieldsOnSheet(sourceKey, tableName, credential, [name], fetchImpl)
    },
    async deleteFields(names) {
      return deleteFieldsOnSheet(sourceKey, tableName, credential, names, fetchImpl)
    },

    async listRecords(page) {
      const load = () => getGrid(sourceKey, tableName, credential, fetchImpl)
      const grid = await (gridCache ? gridCache.get(tabKey(sourceKey, tableName, credential), load) : load())
      const [header, ...dataRows] = grid
      const schema = header ? inferSchema(header, dataRows) : new Map<string, ConduitFieldType>()
      const allRows = rowsFromGrid(grid)

      const offset = page?.cursor ? Number(page.cursor) : 0
      const limit = page?.limit ?? allRows.length
      const slice = allRows.slice(offset, offset + limit)
      const nextOffset = offset + slice.length
      return {
        records: slice.map((row) => toConduitRecord(row, schema)),
        nextCursor: nextOffset < allRows.length ? String(nextOffset) : null,
      }
    },

    // The response is the submitted fields and the new id; Sheets stores
    // values as given, so they aren't read back.
    async createRecord(fields) {
      const [row] = await appendRows(sourceKey, tableName, credential, [fieldsToFlatRow(fields)], fetchImpl)
      return { id: row.id, fields }
    },
    async createRecords(fieldsList) {
      const rows = await appendRows(sourceKey, tableName, credential, fieldsList.map(fieldsToFlatRow), fetchImpl)
      return rows.map((row, i) => ({ id: row.id, fields: fieldsList[i] }))
    },

    // A replace returns exactly the submitted fields.
    async replaceRecord(record) {
      const result = await bulkReplaceRows(sourceKey, tableName, credential, [fromConduitRecord(record)], fetchImpl)
      return result ? { id: record.id, fields: record.fields } : null
    },
    async replaceRecords(records) {
      const result = await bulkReplaceRows(sourceKey, tableName, credential, records.map(fromConduitRecord), fetchImpl)
      return result ? records.map((record) => ({ id: record.id, fields: record.fields })) : null
    },

    // An update's response includes fields from the existing row, so it
    // uses the inferred schema.
    async updateRecord(record) {
      const result = await bulkUpdateRows(sourceKey, tableName, credential, [fromConduitRecord(record)], fetchImpl)
      return result ? toConduitRecord(result.rows[0], result.schema) : null
    },
    async updateRecords(records) {
      const result = await bulkUpdateRows(sourceKey, tableName, credential, records.map(fromConduitRecord), fetchImpl)
      return result ? result.rows.map((row) => toConduitRecord(row, result.schema)) : null
    },

    deleteRecord(id) {
      return deleteRows(sourceKey, tableName, credential, [id], fetchImpl)
    },
    deleteRecords(ids) {
      return deleteRows(sourceKey, tableName, credential, ids, fetchImpl)
    },
  }
  if (!gridCache) return table
  // Any write through this client drops the spreadsheet's cached tabs,
  // so a read after it sees the change. Edits made elsewhere (in Google
  // Sheets itself) show once the cache entry expires.
  for (const name of WRITE_METHODS) {
    const write = table[name] as (...args: unknown[]) => Promise<unknown>
    ;(table as unknown as Record<string, unknown>)[name] = async (...args: unknown[]) => {
      try {
        return await write(...args)
      } finally {
        gridCache.invalidate(`${sourceKey}\0`)
      }
    }
  }
  return table
}

const WRITE_METHODS = [
  'createField',
  'createFields',
  'deleteField',
  'deleteFields',
  'createRecord',
  'createRecords',
  'replaceRecord',
  'replaceRecords',
  'updateRecord',
  'updateRecords',
  'deleteRecord',
  'deleteRecords',
] as const satisfies readonly (keyof ConduitTable)[]

// A budget of requests per minute to Google, for the whole process and
// per access token, kept below Google's own quotas so callers get a
// 503 with Retry-After before Google refuses everyone. Reads and
// writes have separate budgets, as Google's quotas do.
const BUDGET_WINDOW_MS = 60_000

class RequestBudget {
  private readonly windows = new Map<string, number[]>()

  constructor(private readonly perMinute: number, private readonly perCredentialPerMinute: number) {}

  take(kind: 'read' | 'write', credential: string): void {
    const now = Date.now()
    // Access tokens change hourly; drop windows with nothing in the last
    // minute so old tokens' windows don't pile up.
    for (const [key, window] of this.windows) if ((window.at(-1) ?? 0) <= now - BUDGET_WINDOW_MS) this.windows.delete(key)
    const check = (key: string, limit: number) => {
      const window = (this.windows.get(key) ?? []).filter((at) => at > now - BUDGET_WINDOW_MS)
      this.windows.set(key, window)
      if (window.length >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((window[0]! + BUDGET_WINDOW_MS - now) / 1000))
        throw new ConduitRateLimitError(SOURCE, `Sheets ${kind} budget used up for this minute`, retryAfterSeconds)
      }
      return window
    }
    const all = check(kind, this.perMinute)
    const mine = check(`${kind}\0${tokenDigest(credential)}`, this.perCredentialPerMinute)
    all.push(now)
    mine.push(now)
  }
}

export interface GoogleSheetsClientOptions {
  // How long list reads may reuse a tab's contents, in milliseconds; 0
  // turns the cache off.
  readCacheMs: number
  // Requests per minute to Google, for the process and per access token,
  // for reads and for writes. Absent: no budget.
  budget?: { perMinute: number; perCredentialPerMinute: number }
}

// Exported for its unit test; under NODE_ENV=test googleSheetsClient is
// the in-memory fake below.
export function createHttpSheetsClient(options: GoogleSheetsClientOptions = { readCacheMs: 0 }): ConduitSourceClient {
  // So paging through a large sheet reads it from Google once.
  const gridCache = options.readCacheMs > 0 ? new TtlCache<string[][]>(options.readCacheMs) : undefined
  const budget = options.budget ? new RequestBudget(options.budget.perMinute, options.budget.perCredentialPerMinute) : undefined
  return {
    // No handshake: connect() only keeps sourceKey and credential for
    // open().
    async connect(sourceKey, credential, baseFetch = fetch) {
      const fetchImpl: typeof fetch = budget
        ? (input, init) => {
            budget.take((init?.method ?? 'GET').toUpperCase() === 'GET' ? 'read' : 'write', credential)
            return baseFetch(input, init)
          }
        : baseFetch
      return {
        async listTables() {
          return cached(`tabs\0${sourceKey}\0${tokenDigest(credential)}`, async () => {
            const response = await sheetsFetch(`${sourceKey}?fields=sheets.properties.title`, credential, undefined, fetchImpl)
            await throwForStatus(response, 'list tabs')
            const body = (await response.json()) as { sheets?: { properties?: { title?: string } }[] }
            return (body.sheets ?? [])
              .map((sheet) => sheet.properties?.title)
              .filter((title): title is string => Boolean(title))
          })
        },
        open(config) {
          return openHttpTable(sourceKey, credential, tableFromConfig(config), fetchImpl, gridCache)
        },
      }
    },
    // Nothing to close for a REST API.
    async disconnect() {},
    capabilities: () => ({ methods: ALL_HTTP_METHODS, bulkCreate: true }),
  }
}

// --- Fake client: in-memory, used under NODE_ENV=test ---
//
// Keyed by `${sourceKey}\0${tableName ?? ''}`. Matches the real client's
// atomicity and schema rules (checkFakeSchema, the bulk methods), and
// stores ConduitRecords with typed values, so tests see the same types
// the real client returns.

const fakeStore = new Map<string, ConduitRecord[]>()
const fakeAuthFailures = new Set<string>()
// A valid credential without access to the file: ConduitSourceError,
// as the real client maps Google's 403/404.
const fakeForbiddenFailures = new Set<string>()
// As in ensureColumnsForWrite: no entry means any field is accepted;
// once set, unknown fields are rejected.
const fakeSchemas = new Map<string, Set<string>>()

function fakeKey(sourceKey: string, tableName: string | undefined): string {
  return `${sourceKey}\0${tableName ?? ''}`
}

function checkFakeAccess(sourceKey: string): void {
  if (fakeAuthFailures.has(sourceKey)) {
    throw new ConduitAuthError(SOURCE, 'Sheets read failed: access token rejected (401)')
  }
  if (fakeForbiddenFailures.has(sourceKey)) {
    throw new ConduitSourceError(SOURCE, 'Sheets read failed: caller lacks access to this file (403)', 403)
  }
}

// As createFieldsOnSheet. May create the schema for a sheet never
// written to.
function createFakeFields(sourceKey: string, tableName: string | undefined, names: string[]): void {
  checkFakeAccess(sourceKey)
  if (names.includes(ID_COLUMN_NAME)) {
    throw new Error(`"${ID_COLUMN_NAME}" is reserved and can't be used as a field name`)
  }
  const key = fakeKey(sourceKey, tableName)
  const known = fakeSchemas.get(key) ?? new Set<string>()
  for (const name of names) known.add(name)
  fakeSchemas.set(key, known)
}

// As deleteFieldsOnSheet: removes the name from the schema and the
// field from every stored row. Unknown names are skipped.
function deleteFakeFields(sourceKey: string, tableName: string | undefined, names: string[]): void {
  checkFakeAccess(sourceKey)
  const key = fakeKey(sourceKey, tableName)
  const known = fakeSchemas.get(key)
  if (known) for (const name of names) known.delete(name)
  const rows = fakeStore.get(key)
  if (!rows) return
  for (const row of rows) {
    for (const name of names) delete row.fields[name]
  }
}

// Checked once per batch, as ensureColumnsForWrite is.
function checkFakeSchema(key: string, fieldsList: ConduitFields[]): void {
  const known = fakeSchemas.get(key)
  const submittedFieldNames = unionFieldNames(fieldsList)
  if (!known) {
    fakeSchemas.set(key, new Set(submittedFieldNames))
    return
  }
  const unknown = submittedFieldNames.filter((name) => !known.has(name))
  if (unknown.length > 0) throw new ConduitUnknownFieldError(SOURCE, unknown)
}

function appendRowsFake(sourceKey: string, tableName: string | undefined, fieldsList: ConduitFields[]): ConduitRecord[] {
  checkFakeAccess(sourceKey)
  const key = fakeKey(sourceKey, tableName)
  checkFakeSchema(key, fieldsList)
  const rows = fieldsList.map((fields) => ({ id: randomRowId(), fields }))
  fakeStore.set(key, [...(fakeStore.get(key) ?? []), ...rows])
  return rows
}

// Atomic: returns null and writes nothing if any id isn't found.
function bulkWriteRowsFake(
  sourceKey: string,
  tableName: string | undefined,
  entries: ConduitRecord[],
  merge: (existing: ConduitFields, fields: ConduitFields) => ConduitFields,
): ConduitRecord[] | null {
  checkFakeAccess(sourceKey)
  const key = fakeKey(sourceKey, tableName)
  const rows = fakeStore.get(key) ?? []
  const indexes = entries.map((entry) => rows.findIndex((row) => row.id === entry.id))
  if (indexes.some((index) => index === -1)) return null

  const merged = entries.map((entry, i) => ({ id: entry.id, fields: merge(rows[indexes[i]].fields, entry.fields) }))
  checkFakeSchema(
    key,
    merged.map((r) => r.fields),
  )
  indexes.forEach((rowIndex, i) => {
    rows[rowIndex] = merged[i]
  })
  fakeStore.set(key, rows)
  return merged
}

function deleteRowsFake(sourceKey: string, tableName: string | undefined, ids: string[]): boolean {
  checkFakeAccess(sourceKey)
  const key = fakeKey(sourceKey, tableName)
  const rows = fakeStore.get(key) ?? []
  if (!ids.every((id) => rows.some((row) => row.id === id))) return false
  fakeStore.set(
    key,
    rows.filter((row) => !ids.includes(row.id)),
  )
  return true
}

// Values here are stored typed, so typeof is enough.
function inferFakeFieldType(values: (string | number | boolean | null)[]): ConduitFieldType {
  const nonNull = values.filter((v) => v !== null)
  if (nonNull.length === 0) return 'string'
  if (nonNull.every((v) => typeof v === 'number')) return 'number'
  if (nonNull.every((v) => typeof v === 'boolean')) return 'boolean'
  return 'string'
}

function openFakeTable(sourceKey: string, tableName: string | undefined): ConduitTable {
  return {
    async describeFields() {
      checkFakeAccess(sourceKey)
      const known = fakeSchemas.get(fakeKey(sourceKey, tableName))
      const rows = fakeStore.get(fakeKey(sourceKey, tableName)) ?? []
      return [...(known ?? [])].map((name) => ({
        name,
        type: inferFakeFieldType(rows.map((row) => row.fields[name] ?? null)),
        // Always true, as in the real client.
        nullable: true,
      }))
    },

    async createField(name) {
      createFakeFields(sourceKey, tableName, [name])
    },
    async createFields(fields) {
      createFakeFields(
        sourceKey,
        tableName,
        fields.map((field) => field.name),
      )
    },
    async deleteField(name) {
      deleteFakeFields(sourceKey, tableName, [name])
    },
    async deleteFields(names) {
      deleteFakeFields(sourceKey, tableName, names)
    },

    async listRecords(page) {
      checkFakeAccess(sourceKey)
      const allRows = [...(fakeStore.get(fakeKey(sourceKey, tableName)) ?? [])]
      const offset = page?.cursor ? Number(page.cursor) : 0
      const limit = page?.limit ?? allRows.length
      const slice = allRows.slice(offset, offset + limit)
      const nextOffset = offset + slice.length
      return { records: slice, nextCursor: nextOffset < allRows.length ? String(nextOffset) : null }
    },

    async createRecord(fields) {
      const [row] = appendRowsFake(sourceKey, tableName, [fields])
      return row
    },
    async createRecords(fieldsList) {
      return appendRowsFake(sourceKey, tableName, fieldsList)
    },

    async replaceRecord(record) {
      const rows = bulkWriteRowsFake(sourceKey, tableName, [record], (_existing, fields) => fields)
      return rows ? rows[0] : null
    },
    async replaceRecords(records) {
      const rows = bulkWriteRowsFake(sourceKey, tableName, records, (_existing, fields) => fields)
      return rows ?? null
    },

    async updateRecord(record) {
      const rows = bulkWriteRowsFake(sourceKey, tableName, [record], (existing, fields) => ({
        ...existing,
        ...fields,
      }))
      return rows ? rows[0] : null
    },
    async updateRecords(records) {
      const rows = bulkWriteRowsFake(sourceKey, tableName, records, (existing, fields) => ({
        ...existing,
        ...fields,
      }))
      return rows ?? null
    },

    async deleteRecord(id) {
      return deleteRowsFake(sourceKey, tableName, [id])
    },
    async deleteRecords(ids) {
      return deleteRowsFake(sourceKey, tableName, ids)
    },
  }
}

function createFakeSheetsClient(): ConduitSourceClient {
  return {
    async connect(sourceKey) {
      checkFakeAccess(sourceKey)
      return {
        async listTables() {
          return [] // no fake test currently exercises multi-tab discovery
        },
        open(config) {
          return openFakeTable(sourceKey, tableFromConfig(config))
        },
      }
    },
    async disconnect() {},
    capabilities: () => ({ methods: ALL_HTTP_METHODS, bulkCreate: true }),
  }
}

/**
 * For tests: seeds a fake sheet's rows, each with a new id, and fixes
 * its schema to their field names, as for an existing spreadsheet.
 */
export function seedFakeSheet(sourceKey: string, rows: ConduitFields[], tableName?: string): ConduitRecord[] {
  const seeded = rows.map((fields) => ({ id: randomRowId(), fields }))
  const key = fakeKey(sourceKey, tableName)
  fakeStore.set(key, seeded)
  fakeSchemas.set(key, new Set(unionFieldNames(rows)))
  return seeded
}

/** For tests: makes this spreadsheet throw ConduitAuthError, as for a revoked grant. */
export function simulateFakeAuthFailure(sourceKey: string): void {
  fakeAuthFailures.add(sourceKey)
}

/**
 * For tests: makes this spreadsheet throw ConduitSourceError(403), as for
 * a valid grant without access to the file.
 */
export function simulateFakeForbidden(sourceKey: string): void {
  fakeForbiddenFailures.add(sourceKey)
}

/** For tests: clears all fake spreadsheet state. */
export function resetFakeSheets(): void {
  fakeStore.clear()
  fakeAuthFailures.clear()
  fakeForbiddenFailures.clear()
  fakeSchemas.clear()
}

/** For tests: a fake table's stored records. */
export async function listFakeRecords(sourceKey: string, tableName?: string): Promise<ConduitRecord[]> {
  const source = await googleSheetsClient.connect(sourceKey, 'unused')
  const { records } = await source.open(tableName ? JSON.stringify({ table: tableName }) : undefined).listRecords()
  return records
}

export const googleSheetsClient: ConduitSourceClient =
  process.env.NODE_ENV === 'test' ? createFakeSheetsClient() : createHttpSheetsClient()

// A Sheets client with a read cache and request budget, for a gateway's
// `sourceClients`. Under NODE_ENV=test, the same in-memory fake.
export function createGoogleSheetsClient(options: GoogleSheetsClientOptions): ConduitSourceClient {
  return process.env.NODE_ENV === 'test' ? googleSheetsClient : createHttpSheetsClient(options)
}

// The sourceClients registry is in index.ts, to avoid a circular import
// with fastmail.ts.
