import { createHash } from 'node:crypto'
import { createRowIdMaker } from './row-id.ts'
import { ConduitUnknownFieldError } from './field-map.ts'

export { createRowIdMaker, ALPHABET as BASE31_ALPHABET } from './row-id.ts'

// The `source` on errors this client throws.
const SOURCE = 'googleSheets'

// open() receives the conduit's suri_config as JSON; Sheets uses only
// `.table`. A missing or malformed config means the first tab.
export function tableFromConfig(config: string | undefined): string | undefined {
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

export const GOOGLE_SHEETS_CAPABILITIES: ConduitSourceCapabilities = { methods: ALL_HTTP_METHODS, bulkCreate: true }

export interface ConduitSourceClient {
  // Without fetchImpl, the connection uses the fetch the client was
  // created with. A caller that counts provider bytes passes its own
  // (GatewayRuntime.instrumentFetch).
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
// A cell as written and read: values go in as given (valueInputOption
// RAW: never parsed, so text that looks like a formula, a number or a
// date stays text) and come back unformatted (a number as a number,
// a date typed into the sheet as its displayed text). The header row
// is read as text. The helpers below work on a flat row with the id
// under `id`; the ConduitTable methods convert to and from
// ConduitRecord. A value's type is the caller's business: the gateway
// types it by the conduit's fields (field-schema.ts).
export type Cell = string | number | boolean
type Grid = Cell[][]
type FlatRow = Record<string, Cell>

// The header row, read as text (getGrid).
const headerOf = (grid: Grid): string[] => (grid[0] ?? []) as string[]

function toConduitRecord(row: FlatRow): ConduitRecord {
  const { id, ...rest } = row
  const fields: ConduitFields = {}
  for (const [name, value] of Object.entries(rest)) {
    fields[name] = value === '' ? null : value
  }
  return { id: String(id), fields }
}

function fieldsToFlatRow(fields: ConduitFields): FlatRow {
  const row: FlatRow = {}
  for (const [name, value] of Object.entries(fields)) {
    row[name] = value ?? ''
  }
  return row
}

function fromConduitRecord(record: ConduitRecord): FlatRow {
  return { id: record.id, ...fieldsToFlatRow(record.fields) }
}

const NUMBER_RE = /^-?\d+(\.\d+)?$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/

// For describeFields only: a column is typed only if every non-blank
// value agrees; one text value makes it 'string'. Dates are tested
// before numbers; no value matches both. Reads never type values this
// way (see Cell).
export function inferColumnType(values: Cell[]): ConduitFieldType {
  const nonBlank = values.filter((v) => v !== '')
  if (nonBlank.length === 0) return 'string'
  if (nonBlank.every((v) => typeof v === 'string' && DATE_RE.test(v))) return 'date'
  if (nonBlank.every((v) => typeof v === 'number' || (typeof v === 'string' && NUMBER_RE.test(v)))) return 'number'
  if (nonBlank.every((v) => typeof v === 'boolean' || v === 'TRUE' || v === 'FALSE')) return 'boolean'
  return 'string'
}

function inferSchema(header: string[], dataRows: Grid): Map<string, ConduitFieldType> {
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
// Reads take every row; appends name a range only to anchor the table.
const READ_RANGE = 'A:ZZ'
const APPEND_RANGE = 'A1:ZZ10000'

// Where and how the client reaches the Sheets API.
export interface SheetsEndpoint {
  // For example https://sheets.googleapis.com/v4/spreadsheets.
  apiUrl: string
  fetch: typeof fetch
}

// One client's endpoint, clock, row-id maker and caches, which every
// call below shares.
interface SheetsContext extends SheetsEndpoint {
  now: () => number
  makeRowId: () => string
  metadata: TtlCache<unknown>
  // List reads' copies of a tab; absent when readCacheMs is 0.
  grids?: TtlCache<Grid>
}

async function sheetsFetch(
  path: string,
  credential: string,
  init: RequestInit | undefined,
  ctx: SheetsEndpoint,
): Promise<Response> {
  return ctx.fetch(`${ctx.apiUrl}/${path}`, {
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
  ctx: SheetsContext,
): Promise<Grid> {
  const response = await sheetsFetch(
    `${sourceKey}/values/${rangeFor(tableName, READ_RANGE)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
    credential,
    undefined,
    ctx,
  )
  await throwForStatus(response, 'read')
  const body = (await response.json()) as { values?: Grid }
  const [header, ...rows] = body.values ?? []
  return header ? [header.map(String), ...rows] : []
}

// The tab's numeric id (gid), which deleteDimension and tab links need.
// Falls back to the first tab when `tableName` is unset or not found;
// callers read the grid first, which already fails for an unknown tab.
export async function getSheetId(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  ctx: SheetsEndpoint,
): Promise<number> {
  const response = await sheetsFetch(`${sourceKey}?fields=sheets.properties(sheetId,title)`, credential, undefined, ctx)
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
export function rowToFields(header: string[], row: Cell[]): FlatRow {
  return Object.fromEntries(header.map((name, i) => (name === ID_COLUMN_NAME ? ['id', String(row[i] ?? '')] : [name, row[i] ?? ''])))
}

// Rows with an id. Rows with a blank id, or every row when the sheet has
// no id column, aren't records yet and are left out.
export function rowsFromGrid(grid: Grid): FlatRow[] {
  if (grid.length === 0) return []
  const [, ...dataRows] = grid
  const header = headerOf(grid)
  return dataRows.map((row) => rowToFields(header, row)).filter((row) => Boolean(row.id))
}

function gridRowFromFields(header: string[], fields: FlatRow): Cell[] {
  return header.map((name) => (name === ID_COLUMN_NAME ? (fields.id ?? '') : (fields[name] ?? '')))
}

function findRowIndex(grid: Grid, idIndex: number, id: string): number {
  return grid.findIndex((row, i) => i > 0 && String(row[idIndex] ?? '') === id)
}

// Every field name in a batch except `id`, so the schema is checked
// once per batch.
export function unionFieldNames(rows: Record<string, unknown>[]): string[] {
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
  grid: Grid,
  fieldNames: string[],
  ctx: SheetsContext,
): Promise<Grid> {
  const header = headerOf(grid)

  const needsIdColumn = idColumnIndex(header) === -1
  const missingFieldNames = fieldNames.filter((name) => name !== 'id' && !header.includes(name))

  const hasAnyFieldColumn = header.some((name) => name !== ID_COLUMN_NAME)
  if (hasAnyFieldColumn && missingFieldNames.length > 0) {
    throw new ConduitUnknownFieldError(SOURCE, missingFieldNames)
  }

  const newColumnNames = needsIdColumn ? [ID_COLUMN_NAME, ...missingFieldNames] : missingFieldNames
  return addColumnsToGrid(sourceKey, tableName, credential, grid, newColumnNames, ctx)
}

// Appends header columns and backfills ids for existing rows. Used by
// ensureColumnsForWrite (which decides whether columns may be added) and
// createFieldsOnSheet (an owner action, always allowed).
async function addColumnsToGrid(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  grid: Grid,
  newColumnNames: string[],
  ctx: SheetsContext,
): Promise<Grid> {
  const header = headerOf(grid)
  const dataRows = grid.slice(1)
  if (newColumnNames.length === 0) return grid

  const backfillIds = dataRows.map(() => ctx.makeRowId())

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
    { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) },
    ctx,
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
  ctx: SheetsContext,
): Promise<void> {
  const names = fields.map((field) => field.name)
  if (names.includes(ID_COLUMN_NAME)) {
    throw new Error(`"${ID_COLUMN_NAME}" is reserved and can't be used as a field name`)
  }

  const grid = await getGrid(sourceKey, tableName, credential, ctx)
  const header = headerOf(grid)
  const newColumnNames = names.filter((name) => !header.includes(name))
  await addColumnsToGrid(sourceKey, tableName, credential, grid, newColumnNames, ctx)

  // Clear the cached field list so the next describeFields sees the new
  // column.
  ctx.metadata.invalidate(`fields\0${tabKey(sourceKey, tableName, credential)}`)
}

// listTables and describeFields are called as someone switches tabs
// while setting up a conduit. Their results are cached per spreadsheet
// and tab for 30 seconds, to absorb those bursts without serving stale
// lists for long.
const SHEET_METADATA_CACHE_TTL_MS = 30_000

// Values by key for `ttlMs`: this metadata, and list reads' grids
// (createGoogleSheetsClient's readCacheMs). A load in flight is shared; a
// failed one isn't kept.
class TtlCache<T> {
  private readonly entries = new Map<string, { value: Promise<T>; expiresAt: number }>()
  private readonly ttlMs: number
  private readonly now: () => number

  constructor(ttlMs: number, now: () => number) {
    this.ttlMs = ttlMs
    this.now = now
  }

  get<V extends T>(key: string, load: () => Promise<V>): Promise<V> {
    const now = this.now()
    for (const [k, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(k)
    const hit = this.entries.get(key)
    if (hit) return hit.value as Promise<V>
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
  ctx: SheetsContext,
): Promise<FlatRow[]> {
  const grid = await ensureColumnsForWrite(
    sourceKey,
    tableName,
    credential,
    await getGrid(sourceKey, tableName, credential, ctx),
    unionFieldNames(fieldsList),
    ctx,
  )
  const header = headerOf(grid)
  const rows = fieldsList.map((fields) => ({ ...fields, id: ctx.makeRowId() }))
  const response = await sheetsFetch(
    `${sourceKey}/values/${rangeFor(tableName, APPEND_RANGE)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    credential,
    { method: 'POST', body: JSON.stringify({ values: rows.map((row) => gridRowFromFields(header, row)) }) },
    ctx,
  )
  await throwForStatus(response, 'append')
  return rows
}

// Finds every entry's row from one grid read, merges each with its
// existing row via `merge`, adds columns for the batch, and writes all
// ranges in one values.batchUpdate. Returns null and writes nothing if
// any id isn't found, so the batch is atomic.
async function bulkWriteRows(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  entries: FlatRow[],
  merge: (existing: FlatRow, fields: FlatRow) => FlatRow,
  ctx: SheetsContext,
): Promise<{ rows: FlatRow[] } | null> {
  let grid = await getGrid(sourceKey, tableName, credential, ctx)
  if (grid.length === 0) return null
  const header = headerOf(grid)

  const idIndex = idColumnIndex(header)
  if (idIndex === -1) return null // no id column yet means nothing has ever been assigned this id

  const rowIndexes: number[] = []
  for (const entry of entries) {
    const rowIndex = findRowIndex(grid, idIndex, String(entry.id))
    if (rowIndex === -1) return null
    rowIndexes.push(rowIndex)
  }

  const merged = entries.map((entry, i) => ({
    ...merge(rowToFields(header, grid[rowIndexes[i]]), entry),
    id: entry.id,
  }))

  // Row indexes stay valid: only columns are added.
  grid = await ensureColumnsForWrite(sourceKey, tableName, credential, grid, unionFieldNames(merged), ctx)

  const data = merged.map((fields, i) => ({
    range: rangeFor(tableName, `A${rowIndexes[i] + 1}:ZZ${rowIndexes[i] + 1}`),
    values: [gridRowFromFields(headerOf(grid), fields)],
  }))

  const response = await sheetsFetch(
    `${sourceKey}/values:batchUpdate`,
    credential,
    { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) },
    ctx,
  )
  await throwForStatus(response, 'bulk write')
  return { rows: merged }
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
  ctx: SheetsContext,
): Promise<boolean> {
  const grid = await getGrid(sourceKey, tableName, credential, ctx)
  const idIndex = idColumnIndex(headerOf(grid))
  if (idIndex === -1) return false // no id column yet means nothing has ever been assigned this id

  const rowIndexes: number[] = []
  for (const id of ids) {
    const rowIndex = findRowIndex(grid, idIndex, id)
    if (rowIndex === -1) return false
    rowIndexes.push(rowIndex)
  }

  const sheetId = await getSheetId(sourceKey, tableName, credential, ctx)
  const requests = [...rowIndexes]
    .sort((a, b) => b - a)
    .map((rowIndex) => ({
      deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } },
    }))

  const response = await sheetsFetch(
    `${sourceKey}:batchUpdate`,
    credential,
    { method: 'POST', body: JSON.stringify({ requests }) },
    ctx,
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
  ctx: SheetsContext,
): Promise<void> {
  const grid = await getGrid(sourceKey, tableName, credential, ctx)
  const header = headerOf(grid)
  const columnIndexes = names
    .map((name) => header.indexOf(name))
    .filter((index) => index !== -1)
  if (columnIndexes.length === 0) return

  const sheetId = await getSheetId(sourceKey, tableName, credential, ctx)
  const requests = [...columnIndexes]
    .sort((a, b) => b - a)
    .map((columnIndex) => ({
      deleteDimension: { range: { sheetId, dimension: 'COLUMNS', startIndex: columnIndex, endIndex: columnIndex + 1 } },
    }))

  const response = await sheetsFetch(
    `${sourceKey}:batchUpdate`,
    credential,
    { method: 'POST', body: JSON.stringify({ requests }) },
    ctx,
  )
  await throwForStatus(response, 'delete columns')

  // Clear the cached field list, as in createFieldsOnSheet.
  ctx.metadata.invalidate(`fields\0${tabKey(sourceKey, tableName, credential)}`)
}

function bulkReplaceRows(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  entries: FlatRow[],
  ctx: SheetsContext,
): Promise<{ rows: FlatRow[] } | null> {
  return bulkWriteRows(sourceKey, tableName, credential, entries, (_existing, fields) => fields, ctx)
}

function bulkUpdateRows(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  entries: FlatRow[],
  ctx: SheetsContext,
): Promise<{ rows: FlatRow[] } | null> {
  return bulkWriteRows(
    sourceKey,
    tableName,
    credential,
    entries,
    (existing, fields) => ({ ...existing, ...fields }),
    ctx,
  )
}

// The ConduitTable for one spreadsheet and tab. No I/O until a method
// is called.
function openHttpTable(
  sourceKey: string,
  credential: string,
  tableName: string | undefined,
  ctx: SheetsContext,
): ConduitTable {
  const table: ConduitTable = {
    async describeFields() {
      return ctx.metadata.get(`fields\0${tabKey(sourceKey, tableName, credential)}`, async () => {
        const grid = await getGrid(sourceKey, tableName, credential, ctx)
        if (grid.length === 0) return []
        const [, ...dataRows] = grid
        const header = headerOf(grid)
        const schema = inferSchema(header, dataRows)
        return header
          .filter((name) => name && name !== ID_COLUMN_NAME)
          .map((name) => ({ name, type: schema.get(name) ?? 'string', nullable: true }))
        // Any Sheets cell can be blank.
      })
    },

    async createField(name, type) {
      return createFieldsOnSheet(sourceKey, tableName, credential, [{ name, type }], ctx)
    },
    async createFields(fields) {
      return createFieldsOnSheet(sourceKey, tableName, credential, fields, ctx)
    },
    async deleteField(name) {
      return deleteFieldsOnSheet(sourceKey, tableName, credential, [name], ctx)
    },
    async deleteFields(names) {
      return deleteFieldsOnSheet(sourceKey, tableName, credential, names, ctx)
    },

    async listRecords(page) {
      const load = () => getGrid(sourceKey, tableName, credential, ctx)
      const grid = await (ctx.grids ? ctx.grids.get(tabKey(sourceKey, tableName, credential), load) : load())
      const allRows = rowsFromGrid(grid)

      const offset = page?.cursor ? Number(page.cursor) : 0
      const limit = page?.limit ?? allRows.length
      const slice = allRows.slice(offset, offset + limit)
      const nextOffset = offset + slice.length
      return {
        records: slice.map((row) => toConduitRecord(row)),
        nextCursor: nextOffset < allRows.length ? String(nextOffset) : null,
      }
    },

    // The response is the submitted fields and the new id; Sheets stores
    // values as given, so they aren't read back.
    async createRecord(fields) {
      const [row] = await appendRows(sourceKey, tableName, credential, [fieldsToFlatRow(fields)], ctx)
      return { id: String(row.id), fields }
    },
    async createRecords(fieldsList) {
      const rows = await appendRows(sourceKey, tableName, credential, fieldsList.map(fieldsToFlatRow), ctx)
      return rows.map((row, i) => ({ id: String(row.id), fields: fieldsList[i] }))
    },

    // A replace returns exactly the submitted fields.
    async replaceRecord(record) {
      const result = await bulkReplaceRows(sourceKey, tableName, credential, [fromConduitRecord(record)], ctx)
      return result ? { id: record.id, fields: record.fields } : null
    },
    async replaceRecords(records) {
      const result = await bulkReplaceRows(sourceKey, tableName, credential, records.map(fromConduitRecord), ctx)
      return result ? records.map((record) => ({ id: record.id, fields: record.fields })) : null
    },

    // An update's response includes fields from the existing row, so it
    // uses the inferred schema.
    async updateRecord(record) {
      const result = await bulkUpdateRows(sourceKey, tableName, credential, [fromConduitRecord(record)], ctx)
      return result ? toConduitRecord(result.rows[0]) : null
    },
    async updateRecords(records) {
      const result = await bulkUpdateRows(sourceKey, tableName, credential, records.map(fromConduitRecord), ctx)
      return result ? result.rows.map((row) => toConduitRecord(row)) : null
    },

    deleteRecord(id) {
      return deleteRows(sourceKey, tableName, credential, [id], ctx)
    },
    deleteRecords(ids) {
      return deleteRows(sourceKey, tableName, credential, ids, ctx)
    },
  }
  if (!ctx.grids) return table
  // Any write through this client drops the spreadsheet's cached tabs,
  // so a read after it sees the change. Edits made elsewhere (in Google
  // Sheets itself) show once the cache entry expires.
  for (const name of WRITE_METHODS) {
    const write = table[name] as (...args: unknown[]) => Promise<unknown>
    ;(table as unknown as Record<string, unknown>)[name] = async (...args: unknown[]) => {
      try {
        return await write(...args)
      } finally {
        ctx.grids?.invalidate(`${sourceKey}\0`)
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
  private readonly perMinute: number
  private readonly perCredentialPerMinute: number
  private readonly now: () => number

  constructor(perMinute: number, perCredentialPerMinute: number, now: () => number) {
    this.perMinute = perMinute
    this.perCredentialPerMinute = perCredentialPerMinute
    this.now = now
  }

  take(kind: 'read' | 'write', credential: string): void {
    const now = this.now()
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

export interface GoogleSheetsClientOptions extends SheetsEndpoint {
  // Milliseconds since the epoch: the caches, the budget and row ids.
  now: () => number
  // How long list reads may reuse a tab's contents, in milliseconds; 0
  // turns the cache off.
  readCacheMs: number
  // Requests per minute to Google, for the process and per access token,
  // for reads and for writes. Absent: no budget.
  budget?: { perMinute: number; perCredentialPerMinute: number }
}

// The Google Sheets source client. Every connection shares its
// endpoint, clock, row-id maker, caches and budget.
export function createGoogleSheetsClient(options: GoogleSheetsClientOptions): ConduitSourceClient {
  const shared = {
    apiUrl: options.apiUrl,
    now: options.now,
    makeRowId: createRowIdMaker(options.now),
    metadata: new TtlCache<unknown>(SHEET_METADATA_CACHE_TTL_MS, options.now),
    // So paging through a large sheet reads it from Google once.
    ...(options.readCacheMs > 0 ? { grids: new TtlCache<Grid>(options.readCacheMs, options.now) } : {}),
  }
  const budget = options.budget ? new RequestBudget(options.budget.perMinute, options.budget.perCredentialPerMinute, options.now) : undefined
  return {
    // No handshake: connect() only keeps sourceKey and credential for
    // open(). A caller's fetch (one that counts bytes) replaces the
    // client's for this connection.
    async connect(sourceKey, credential, connectionFetch = options.fetch) {
      const ctx: SheetsContext = {
        ...shared,
        fetch: budget
          ? (input, init) => {
              budget.take((init?.method ?? 'GET').toUpperCase() === 'GET' ? 'read' : 'write', credential)
              return connectionFetch(input, init)
            }
          : connectionFetch,
      }
      return {
        async listTables() {
          return ctx.metadata.get(`tabs\0${sourceKey}\0${tokenDigest(credential)}`, async () => {
            const response = await sheetsFetch(`${sourceKey}?fields=sheets.properties.title`, credential, undefined, ctx)
            await throwForStatus(response, 'list tabs')
            const body = (await response.json()) as { sheets?: { properties?: { title?: string } }[] }
            return (body.sheets ?? [])
              .map((sheet) => sheet.properties?.title)
              .filter((title): title is string => Boolean(title))
          })
        },
        open(config) {
          return openHttpTable(sourceKey, credential, tableFromConfig(config), ctx)
        },
      }
    },
    // Nothing to close for a REST API.
    async disconnect() {},
    capabilities: () => GOOGLE_SHEETS_CAPABILITIES,
  }
}
