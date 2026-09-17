import { createHash } from 'node:crypto'
import { randomRowId } from './row-id.ts'

export { randomRowId } from './row-id.ts'

// This file's own identity when it throws a conduit-domain error — the
// `source` every ConduitAuthError/ConduitSourceError/ConduitUnknownFieldError
// below carries. A second implementation of ConduitSourceClient in this
// package would define its own.
const SOURCE = 'googleSheets'

// ConduitSource.open() receives the conduit's whole suri_config,
// JSON-encoded — Sheets only ever cares about `.table`. A malformed or
// absent config (a genuinely blank suri_config, `{}`) means "use this
// source's own default," same as always.
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

// Conduit-domain error types — every integration (Google Sheets today;
// Airtable/SQLite/others eventually) throws these, never a backend-specific
// error class, so the gateway's generic error handler
// (middleware/source-errors.ts) never needs to know which integrations
// exist. `source` names which one actually failed (today, always
// 'googleSheets'), for logging and for any source-specific recovery action
// the handler takes.

// A 401-equivalent from the source — distinct from any other failure (a
// bad range, a transient 5xx, a malformed request) because the gateway
// reacts to it differently: it means the owner's credential no longer
// works, not that the request or the underlying data is bad.
export class ConduitAuthError extends Error {
  constructor(
    public readonly source: string,
    message: string,
  ) {
    super(message)
  }
}

// Any other non-2xx response from the source — a deleted/renamed table, a
// transient 5xx, a malformed range. Distinct from ConduitAuthError (which
// means "reconnect/re-auth") and from an actual programming bug (a plain
// thrown Error/TypeError) so middleware/source-errors.ts can turn this
// specific case into a clean JSON 502 without also masking real bugs as if
// they were a source outage.
export class ConduitSourceError extends Error {
  constructor(
    public readonly source: string,
    message: string,
    public readonly status: number,
  ) {
    super(message)
  }
}

// Thrown when a write submits a field name that isn't already a column in
// a source that already has other field columns — see ensureColumnsForWrite
// for why this rejects instead of silently adding the column.
export class ConduitUnknownFieldError extends Error {
  constructor(
    public readonly source: string,
    public readonly fieldName: string,
  ) {
    super(`Unknown field: '${fieldName}'`)
  }
}

// --- The contract (see packages/conduit/INTEGRATIONS.md for the full
// rationale behind this shape) ---

export type ConduitFieldType = 'string' | 'number' | 'boolean' | 'date'

export type ConduitFields = Record<string, string | number | boolean | null>

// `id` is always required here — a record with no id yet (create input)
// isn't a ConduitRecord at all, it's just ConduitFields (see createRecord
// below). Keeping id non-optional on the one shared type means every
// method that receives or returns a ConduitRecord can rely on `.id` being
// a real string, no `!` assertions scattered through every implementation
// and every caller.
export type ConduitRecord = {
  id: string
  fields: ConduitFields
}

// Every RACM method a conduit could ever express, regardless of what's
// actually backing it — used for rendering order (a conduit-management
// UI's own RACM matrix iterates this, disabling whichever a given
// suri_type's own capabilities().methods doesn't include), never as an
// "allowed" list on its own. See INTEGRATIONS.md.
export const ALL_HTTP_METHODS: readonly string[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

// Static facts about an integration type — true for every table/
// mailbox/base it ever opens, never something that varies per
// connected resource or per request. See ConduitSourceClient.capabilities()
// below and INTEGRATIONS.md.
export interface ConduitSourceCapabilities {
  // Which of ALL_HTTP_METHODS this integration actually supports.
  methods: readonly string[]
  // Whether the gateway's bulk-create body ({records: [...]}) is safe
  // to accept for this source. Sheets: yes — createRecords is one
  // atomic batched API call. An integration whose createRecords loops
  // over independent, irreversible per-record side effects instead
  // (Fastmail/Gmail: each is a real, already-sent email, no atomic
  // multi-message send API to back a batch) must report false — a
  // partial-batch failure has no way to report which records already
  // succeeded, so a caller's retry would resend them. This is the
  // create-specific counterpart to "Bulk atomicity" (INTEGRATIONS.md):
  // that section's null/false-for-the-whole-batch contract already
  // makes a partial replace/update/delete safe to retry regardless of
  // per-call atomicity — id-addressed operations are naturally
  // idempotent — so this flag only ever needs to gate create.
  bulkCreate: boolean
}

export interface ConduitSourceClient {
  connect(sourceKey: string, credential: string): Promise<ConduitSource>
  disconnect(source: ConduitSource): Promise<void>

  // Deliberately synchronous and connection-free (no connect() call
  // needed first): a conduit-management UI's own form and conduit
  // save-time RACM validation both need this before any credential
  // exists, not just at request time. Every other method on this interface does
  // real I/O; this is the one exception. See INTEGRATIONS.md.
  capabilities(): ConduitSourceCapabilities
}

export interface ConduitSource {
  listTables(): Promise<string[]>
  // The conduit's whole suri_config, JSON-encoded (the gateway passes
  // its raw stored value straight through — see
  // packages/gateway/middleware/source-client.ts) — not just a literal
  // tab name. Every integration receives the same string and pulls out
  // whatever part of it is its own concern: Sheets reads `.table`; a
  // source with per-conduit config beyond a table name (Fastmail's
  // `recipients`/`subject`) reads that out of the same object instead
  // of needing a wider interface.
  open(config?: string): ConduitTable
}

export interface ConduitTable {
  describeFields(): Promise<Array<{ name: string; type: ConduitFieldType; nullable: boolean }>>
  listRecords(page?: { cursor?: string; limit?: number }): Promise<{
    records: ConduitRecord[]
    nextCursor: string | null
  }>

  // An explicit, authenticated action (an owner defining their own
  // schema) — separate from the gateway's own write
  // path, which never creates a field implicitly (see
  // ensureColumnsForWrite below). `type` is optional and, for a source
  // with no real column types (Sheets), meaningless until data appears
  // — it exists for a future source (Airtable) whose own create-field
  // API needs one. A source whose schema is fixed rather than
  // user-defined (a mailbox's headers) throws ConduitSourceError here,
  // the same documented-deviation shape `replaceRecord` already uses
  // for IMAP — see INTEGRATIONS.md.
  createField(name: string, type?: ConduitFieldType): Promise<void>
  createFields(fields: Array<{ name: string; type?: ConduitFieldType }>): Promise<void>

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
// Everything below the contract works with a flat, all-string row
// (bookkeeping id merged in under the `id` key) — that's what a Sheets grid
// row actually is, and every read/write helper here (getGrid,
// ensureColumnsForWrite, findRowIndex, ...) predates and is independent of
// ConduitRecord's shape. Only the ConduitTable methods themselves convert at
// the boundary: a FlatRow becomes a ConduitRecord on the way out, and a
// ConduitRecord's fields become a FlatRow's values on the way in.
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
  return raw // 'string' and 'date' both stay as-is — see INTEGRATIONS.md: a
  // date field's value is still an ISO-8601 string, `type: 'date'` is a
  // refinement, not a different runtime shape.
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

// Every non-blank value seen in a column must agree for that column to be
// typed as anything other than 'string' — a single stray text value in an
// otherwise-numeric column means the honest answer is 'string', not "mostly
// a number." Checked in this order (date before number) because a genuine
// number can never also match DATE_RE, so there's no ambiguity to break.
// Exported for unit testing without a real Sheets connection.
export function inferColumnType(values: string[]): ConduitFieldType {
  const nonBlank = values.filter((v) => v !== '')
  if (nonBlank.length === 0) return 'string'
  if (nonBlank.every((v) => DATE_RE.test(v))) return 'date'
  if (nonBlank.every((v) => NUMBER_RE.test(v))) return 'number'
  if (nonBlank.every((v) => v === 'TRUE' || v === 'FALSE')) return 'boolean'
  return 'string'
}

// Built once per grid read and reused for every row's read-side conversion
// in the same call, rather than re-inferring per row.
function inferSchema(header: string[], dataRows: string[][]): Map<string, ConduitFieldType> {
  const schema = new Map<string, ConduitFieldType>()
  header.forEach((name, i) => {
    if (name === ID_COLUMN_NAME) return
    schema.set(name, inferColumnType(dataRows.map((row) => row[i] ?? '')))
  })
  return schema
}

// --- Real client: Google Sheets API v4 over fetch() ---
//
// Row/id scheme: the sheet's first row is a header row that must have a
// column named ID_COLUMN_NAME somewhere in it; the rest are arbitrary field
// names. A real, organically-created spreadsheet essentially never already
// has one, so the gateway adds it itself on first write (see
// ensureColumnsForWrite) rather than requiring it to pre-exist. The
// column's position isn't assumed after that: it's wherever
// ensureColumnsForWrite found or placed it (existing sheets keep their own
// id column wherever it already was; sheets that got one added have it
// appended as the last column, not inserted, so nothing already in the
// sheet shifts).
//
// The column is named ID_COLUMN_NAME rather than the more obvious `id` to
// avoid two collision risks with a sheet the user already had: a
// case-insensitive near-miss (their own "ID" or "Id" column, which a naive
// exact-match lookup would neither find nor use, silently adding a
// duplicate), and — worse — actually reusing an existing "id" column that
// already holds the user's own unrelated data. `conduit-id` is distinctive
// enough that a genuine collision is very unlikely. This only affects the
// *sheet's* column name — the JSON API's field is still `id` (see
// rowsFromGrid/gridRowFromFields), so the REST API's response shape doesn't
// change.
//
// A range with no sheet-name prefix (e.g. `A1:ZZ10000`) applies to the
// spreadsheet's first tab — that's still the default when `tableName` is
// undefined, so a conduit that never sets one behaves exactly as before
// multi-tab support existed.
//
// There's no server-side "update the row where id=X" in the Sheets API:
// every write reads the grid first to resolve a row number, then writes
// that exact range. That means no compare-and-swap — a concurrent write
// racing a delete on the same row is a known v1 limitation, same spirit as
// the in-memory (single-process, not distributed) throttle.
//
// Deletes actually remove the row (deleteDimension), not just clear its
// values — leaving permanent blank rows behind is bad UX for something the
// user is looking at directly in their own spreadsheet. The row index used
// is always resolved fresh, immediately before the delete, by scanning for
// the id's current value rather than trusting any previously-remembered
// position — deleteDimension shifts every row below it up by one, but
// nothing here ever caches a row's position across requests, so that's not
// a problem for any *other* row's next operation, only (same as any other
// write) for a delete racing a concurrent write on that exact row.
//
// Bulk operations: every plural method issues exactly one Sheets API
// call for the whole batch (one grid read to
// resolve row numbers/ensure columns, then one values.append /
// values.batchUpdate / batchUpdate for the writes themselves), instead of
// looping a full read-modify-write cycle per record. Two independent
// reasons: (1) `spreadsheets.batchUpdate` and `spreadsheets.values.
// batchUpdate` are both genuinely atomic per Google's own docs — either
// every sub-request applies or none do — so a bad record in a batch of 10
// no longer leaves the first N-1 silently written while the response
// reports the whole request failed; (2) N sequential round trips for a
// single incoming bulk request multiplies real Google API call volume by
// up to 10x (MAX_BULK_RECORDS), which risks tripping Google's own
// per-user/per-project rate limits under real traffic, not just being
// slow.
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const RANGE = 'A1:ZZ10000'

async function sheetsFetch(path: string, credential: string, init?: RequestInit): Promise<Response> {
  return fetch(`${SHEETS_API}/${path}`, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
  })
}

// Google's own non-2xx error bodies are shaped {error: {code, message,
// status}} — this is the one place that shape gets read, so every
// throwForStatus caller gets Google's actual reason (e.g. "Unable to
// parse range: A1:ZZ10000") instead of just a bare status code. Never
// throws itself: an empty body (some non-2xx responses have none), a
// non-JSON body (an intermediary's own HTML error page), or a JSON
// body that isn't shaped as expected all fall back to undefined rather
// than replacing "the request failed" with "and then parsing the
// failure also failed."
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
  throw new ConduitSourceError(SOURCE, `Sheets ${action} failed (${response.status})${detail ? `: ${detail}` : ''}`, response.status)
}

// Sheet names can contain spaces or other characters that A1 notation
// requires single-quoting (with embedded quotes doubled) — always quoting
// is simplest and Sheets accepts it even when not strictly required.
function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

function rangeFor(tableName: string | undefined, a1Range: string): string {
  return tableName ? `${quoteSheetName(tableName)}!${a1Range}` : a1Range
}

async function getGrid(sourceKey: string, tableName: string | undefined, credential: string): Promise<string[][]> {
  const response = await sheetsFetch(`${sourceKey}/values/${rangeFor(tableName, RANGE)}`, credential)
  await throwForStatus(response, 'read')
  const body = (await response.json()) as { values?: string[][] }
  return body.values ?? []
}

// deleteDimension needs the sheet's internal numeric id (gid), not its
// name or the spreadsheet id string. Falls back to the first tab when
// `tableName` is unset (the documented default). A `tableName` that no
// longer matches any tab (renamed/deleted since the conduit was
// configured) never actually reaches this fallback in practice: every
// caller reads the grid via getGrid() first, which already fails with a
// ConduitSourceError on that same bad table name before getSheetId() is
// ever called — the `?? sheets[0]` below is just cheap insurance against
// that assumption ever becoming false, not a real, exercised path today.
//
// Exported: also useful for building a real deep link to a conduit's
// own tab — a plain /edit URL with no `gid` always lands on the
// sheet's first tab regardless of which one the conduit actually
// reads/writes.
export async function getSheetId(sourceKey: string, tableName: string | undefined, credential: string): Promise<number> {
  const response = await sheetsFetch(`${sourceKey}?fields=sheets.properties(sheetId,title)`, credential)
  await throwForStatus(response, 'read sheet metadata')
  const body = (await response.json()) as { sheets?: { properties?: { sheetId?: number; title?: string } }[] }
  const sheets = body.sheets ?? []
  const named = tableName ? sheets.find((sheet) => sheet.properties?.title === tableName) : undefined
  return named?.properties?.sheetId ?? sheets[0]?.properties?.sheetId ?? 0
}

// The sheet's own column name for our row-id bookkeeping — see the
// comment above for why it isn't just `id`.
export const ID_COLUMN_NAME = 'conduit-id'

// Pure — exported for unit testing without a real Sheets connection.
export function idColumnIndex(header: string[]): number {
  return header.indexOf(ID_COLUMN_NAME)
}

// Pure — 1-indexed (A=1), exported for unit testing.
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

// The sheet calls its bookkeeping column ID_COLUMN_NAME, but every FlatRow
// object always uses the plain `id` key, so the REST API's shape stays
// consistent regardless of the sheet's own column naming. This is
// the one and only place a raw grid row is turned into a FlatRow — every
// other conversion (including bulkWriteRows' "existing row" reconstruction)
// must go through this function rather than duplicating the
// ID_COLUMN_NAME -> 'id' translation inline, or a literal `"conduit-id"`
// key leaks into `fields` alongside the translated `id`. Exported for unit
// testing without a real Sheets connection.
export function rowToFields(header: string[], row: string[]): FlatRow {
  return Object.fromEntries(header.map((name, i) => [name === ID_COLUMN_NAME ? 'id' : name, row[i] ?? '']))
}

// Excludes any row with no usable id — a blank id cell, or the id key
// being entirely absent, which happens whenever the header has no
// ID_COLUMN_NAME at all (rowToFields never assigns 'id' in that case,
// e.g. a sheet whose conduit-id column was deleted by hand, or one
// never bootstrapped at all). No id column means no addressable
// ConduitRecord yet, matching this contract's own framing (see
// INTEGRATIONS.md: "a record with no id yet isn't a ConduitRecord at
// all, it's bare ConduitFields"). Exported for unit testing without a
// real Sheets connection.
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

// The union of every field name (excluding `id`, which is bookkeeping, not
// a source column) across a whole batch — schema is checked/bootstrapped
// once per batch, not once per record.
// Takes any array of plain field-name-keyed objects — a FlatRow (real
// client; 'id' filtered out since it's bookkeeping mixed into the same
// object) or a ConduitFields (fake client; no 'id' to filter, the filter
// is simply a no-op there).
function unionFieldNames(rows: Record<string, unknown>[]): string[] {
  return [...new Set(rows.flatMap((row) => Object.keys(row).filter((name) => name !== 'id')))]
}

// Always ensures the ID_COLUMN_NAME column exists (that's our bookkeeping,
// not the user's schema — a conduit can't function without it, so it's
// added unconditionally). Field columns are a different story: they're
// only ever auto-added while bootstrapping a sheet that has no field
// columns yet at all (a brand new connection, or one that's only had the
// id column added so far) — see the block below for why. Both kinds are
// appended as new trailing columns (never inserted), so nothing already in
// the sheet shifts. Existing data rows are backfilled with a generated id
// for the id column specifically (otherwise rows written before the
// column existed would stay permanently unaddressable even after it shows
// up); other new columns are simply blank for existing rows, same as any
// field a legacy row never had a value for. A no-op, no extra request,
// when the header already covers everything this write needs.
//
// `fieldNames` is the set of field names this write (single record or a
// whole bulk batch) needs columns for — callers pass Object.keys(fields)
// for a single record or unionFieldNames(...) for a batch, so a bulk
// write's schema is bootstrapped/checked once for the whole batch, not
// once per record.
//
// Bootstrapping a genuinely header-less sheet with columns for whatever a
// write submits is a one-time thing, not standing behavior: once a sheet
// already has field columns (its schema is established — either because a
// previous write bootstrapped it, or because the user typed the headers
// themselves), a client sending an unrecognized field name gets a rejected
// 400, not a silent, permanent mutation of the user's spreadsheet. A write
// is never allowed to implicitly create a field once a schema exists — a
// Sheets user who wants a new one can just type a header cell themselves,
// or an owner can use createField/createFields above.
async function ensureColumnsForWrite(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  grid: string[][],
  fieldNames: string[],
): Promise<string[][]> {
  const header = grid[0] ?? []

  const needsIdColumn = idColumnIndex(header) === -1
  const missingFieldNames = fieldNames.filter((name) => name !== 'id' && !header.includes(name))

  const hasAnyFieldColumn = header.some((name) => name !== ID_COLUMN_NAME)
  if (hasAnyFieldColumn && missingFieldNames.length > 0) {
    throw new ConduitUnknownFieldError(SOURCE, missingFieldNames[0])
  }

  const newColumnNames = needsIdColumn ? [ID_COLUMN_NAME, ...missingFieldNames] : missingFieldNames
  return addColumnsToGrid(sourceKey, tableName, credential, grid, newColumnNames)
}

// The actual "append columns to the header row, backfill existing rows"
// mechanics, shared by ensureColumnsForWrite's own write-time bootstrap
// path above (gated — only reachable when the sheet has no other field
// columns yet or the column already exists) and createFieldsOnSheet
// below (never gated — an explicit, authenticated owner action, not a
// public write). Neither caller's own gating logic lives here; this is
// just "make these columns real," always.
async function addColumnsToGrid(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  grid: string[][],
  newColumnNames: string[],
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

  const response = await sheetsFetch(`${sourceKey}/values:batchUpdate`, credential, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  })
  await throwForStatus(response, 'add columns')

  const newHeader = [...header, ...newColumnNames]
  const newDataRows = dataRows.map((row, i) => [
    ...row,
    ...newColumnNames.map((columnName) => (columnName === ID_COLUMN_NAME ? backfillIds[i] : '')),
  ])
  return [newHeader, ...newDataRows]
}

// createField/createFields' own logic — an explicit, authenticated owner
// action, never gated the way
// ensureColumnsForWrite is: always creates whatever's missing, idempotent
// for a name that already exists, and refuses the one reserved name no
// caller can claim for their own data.
async function createFieldsOnSheet(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  fields: Array<{ name: string; type?: ConduitFieldType }>,
): Promise<void> {
  const names = fields.map((field) => field.name)
  if (names.includes(ID_COLUMN_NAME)) {
    throw new Error(`"${ID_COLUMN_NAME}" is reserved and can't be used as a field name`)
  }

  const grid = await getGrid(sourceKey, tableName, credential)
  const header = grid[0] ?? []
  const newColumnNames = names.filter((name) => !header.includes(name))
  await addColumnsToGrid(sourceKey, tableName, credential, grid, newColumnNames)

  // Without this, a describeFields() call within SHEET_METADATA_CACHE_TTL_MS
  // of creating a field (e.g. immediately re-opening this same conduit's
  // edit page right after Save) would silently miss it for up to that
  // long — the whole point of this method is that the field is real
  // *now*, not eventually.
  sheetMetadataCache.delete(`fields\0${sourceKey}\0${tableName ?? ''}\0${tokenDigest(credential)}`)
}

// Both listTables and describeFields back any UI built on top of this
// package that lets someone flip between tabs while composing a
// conduit — each interaction fires one request. Reads just a sheet's
// header row (plus data for
// describeFields' type inference) into an in-memory Map keyed by
// spreadsheet+tab, with a short TTL (not cached forever) bounding how
// out-of-date the tab/column list can be — meant to smooth out a few
// seconds of rapid UI interaction within one editing session, not stand in
// for a live read indefinitely.
const SHEET_METADATA_CACHE_TTL_MS = 30_000
const sheetMetadataCache = new Map<string, { value: unknown; expiresAt: number }>()

// Cache keys include a short digest of the access token, not just the
// spreadsheet id — a shared sheet could be reached through more than
// one credential (different grants, or the same grant re-authorized),
// and without this a cache hit could hand one caller a schema list
// fetched using a different credential's own token/permissions. The
// digest exists only to partition the cache per-grant; it's never sent
// anywhere or logged.
function tokenDigest(credential: string): string {
  return createHash('sha256').update(credential).digest('hex').slice(0, 16)
}

async function cached<T>(key: string, fetchFresh: () => Promise<T>): Promise<T> {
  const entry = sheetMetadataCache.get(key)
  if (entry && entry.expiresAt > Date.now()) return entry.value as T
  const value = await fetchFresh()
  sheetMetadataCache.set(key, { value, expiresAt: Date.now() + SHEET_METADATA_CACHE_TTL_MS })
  return value
}

// One shared grid read, one values.append call for the whole batch — see
// the block comment above for why this replaced a per-record loop.
async function appendRows(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  fieldsList: FlatRow[],
): Promise<FlatRow[]> {
  const grid = await ensureColumnsForWrite(
    sourceKey,
    tableName,
    credential,
    await getGrid(sourceKey, tableName, credential),
    unionFieldNames(fieldsList),
  )
  const header = grid[0]
  const rows = fieldsList.map((fields) => ({ ...fields, id: randomRowId() }))
  const response = await sheetsFetch(
    `${sourceKey}/values/${rangeFor(tableName, RANGE)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    credential,
    { method: 'POST', body: JSON.stringify({ values: rows.map((row) => gridRowFromFields(header, row)) }) },
  )
  await throwForStatus(response, 'append')
  return rows
}

// Resolves every entry's current row number from one grid snapshot, merges
// each with its existing row via `merge`, ensures columns for the whole
// batch's union of field names, then writes every resolved range in one
// values.batchUpdate call. Returns null — writing nothing — if any entry's
// id doesn't resolve to a real row, so a bulk update/replace is genuinely
// atomic: never a partial batch.
//
// Also returns a schema inferred from the same grid this already read —
// not an extra request, just reusing data already in hand. Only
// updateRecord(s) actually needs it (an update's response can include
// fields the caller never mentioned, carried over from the existing row,
// so those need real type inference the way listRecords/describeFields
// get it); replaceRecord(s) ignores it, since a replace's response is
// exactly the fields the caller submitted, already correctly typed.
async function bulkWriteRows(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  entries: FlatRow[],
  merge: (existing: FlatRow, fields: FlatRow) => FlatRow,
): Promise<{ rows: FlatRow[]; schema: Map<string, ConduitFieldType> } | null> {
  let grid = await getGrid(sourceKey, tableName, credential)
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

  // rowIndexes stay valid — ensureColumnsForWrite only ever appends
  // columns, never rows.
  grid = await ensureColumnsForWrite(sourceKey, tableName, credential, grid, unionFieldNames(merged))

  const data = merged.map((fields, i) => ({
    range: rangeFor(tableName, `A${rowIndexes[i] + 1}:ZZ${rowIndexes[i] + 1}`),
    values: [gridRowFromFields(grid[0], fields)],
  }))

  const response = await sheetsFetch(`${sourceKey}/values:batchUpdate`, credential, {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'USER_ENTERED', data }),
  })
  await throwForStatus(response, 'bulk write')
  return { rows: merged, schema: inferSchema(grid[0], grid.slice(1)) }
}

// One shared grid read to resolve every id's row number, then one
// batchUpdate carrying one deleteDimension request per row. Returns false
// — deleting nothing — if any id doesn't resolve, so this is atomic like
// bulkWriteRows. deleteDimension requests within one batchUpdate apply
// sequentially in request order, each shifting every row below it up by
// one (confirmed against Google's own batch-request-ordering docs) — so
// requests are ordered highest row index first: since every index here
// was resolved from the same pre-batch grid snapshot, and a delete only
// ever shifts rows *below* it, processing top-down means every later
// request's index is still valid when it's applied.
async function deleteRows(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  ids: string[],
): Promise<boolean> {
  const grid = await getGrid(sourceKey, tableName, credential)
  const idIndex = idColumnIndex(grid[0] ?? [])
  if (idIndex === -1) return false // no id column yet means nothing has ever been assigned this id

  const rowIndexes: number[] = []
  for (const id of ids) {
    const rowIndex = findRowIndex(grid, idIndex, id)
    if (rowIndex === -1) return false
    rowIndexes.push(rowIndex)
  }

  const sheetId = await getSheetId(sourceKey, tableName, credential)
  const requests = [...rowIndexes]
    .sort((a, b) => b - a)
    .map((rowIndex) => ({
      deleteDimension: { range: { sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 } },
    }))

  const response = await sheetsFetch(`${sourceKey}:batchUpdate`, credential, {
    method: 'POST',
    body: JSON.stringify({ requests }),
  })
  await throwForStatus(response, 'bulk delete')
  return true
}

function bulkReplaceRows(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  entries: FlatRow[],
): Promise<{ rows: FlatRow[]; schema: Map<string, ConduitFieldType> } | null> {
  return bulkWriteRows(sourceKey, tableName, credential, entries, (_existing, fields) => fields)
}

function bulkUpdateRows(
  sourceKey: string,
  tableName: string | undefined,
  credential: string,
  entries: FlatRow[],
): Promise<{ rows: FlatRow[]; schema: Map<string, ConduitFieldType> } | null> {
  return bulkWriteRows(sourceKey, tableName, credential, entries, (existing, fields) => ({
    ...existing,
    ...fields,
  }))
}

// Builds the ConduitTable for one (sourceKey, tableName) pair against the
// real Sheets API. Synchronous — see INTEGRATIONS.md's "open() is
// synchronous" note: nothing here does I/O until a real method is called.
function openHttpTable(sourceKey: string, credential: string, tableName: string | undefined): ConduitTable {
  return {
    async describeFields() {
      return cached(`fields\0${sourceKey}\0${tableName ?? ''}\0${tokenDigest(credential)}`, async () => {
        const grid = await getGrid(sourceKey, tableName, credential)
        const [header, ...dataRows] = grid
        if (!header) return []
        const schema = inferSchema(header, dataRows)
        return header
          .filter((name) => name && name !== ID_COLUMN_NAME)
          .map((name) => ({ name, type: schema.get(name) ?? 'string', nullable: true }))
        // nullable is always true for Sheets: any cell can be blank, and
        // there's no column constraint to check — an honest answer, not a
        // placeholder (see INTEGRATIONS.md).
      })
    },

    async createField(name, type) {
      return createFieldsOnSheet(sourceKey, tableName, credential, [{ name, type }])
    },
    async createFields(fields) {
      return createFieldsOnSheet(sourceKey, tableName, credential, fields)
    },

    async listRecords(page) {
      const grid = await getGrid(sourceKey, tableName, credential)
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

    // A create's response is exactly the fields the caller submitted, plus
    // the newly assigned id — Sheets' append doesn't transform values, so
    // reusing the input directly (already correctly typed) is both
    // simpler and more accurate than round-tripping it through the grid's
    // all-string representation and re-inferring types from scratch.
    async createRecord(fields) {
      const [row] = await appendRows(sourceKey, tableName, credential, [fieldsToFlatRow(fields)])
      return { id: row.id, fields }
    },
    async createRecords(fieldsList) {
      const rows = await appendRows(sourceKey, tableName, credential, fieldsList.map(fieldsToFlatRow))
      return rows.map((row, i) => ({ id: row.id, fields: fieldsList[i] }))
    },

    // Same reasoning as createRecord: a replace's response is exactly the
    // submitted fields (a replace clears everything else), so there's
    // nothing to read back or re-type — only whether the write itself
    // succeeded (a non-null result) matters here.
    async replaceRecord(record) {
      const result = await bulkReplaceRows(sourceKey, tableName, credential, [fromConduitRecord(record)])
      return result ? { id: record.id, fields: record.fields } : null
    },
    async replaceRecords(records) {
      const result = await bulkReplaceRows(sourceKey, tableName, credential, records.map(fromConduitRecord))
      return result ? records.map((record) => ({ id: record.id, fields: record.fields })) : null
    },

    // Unlike create/replace, an update's response can carry fields the
    // caller never mentioned (merged in from the existing row) — those
    // need real type inference, the same as listRecords/describeFields
    // get it, not a blanket 'string' default.
    async updateRecord(record) {
      const result = await bulkUpdateRows(sourceKey, tableName, credential, [fromConduitRecord(record)])
      return result ? toConduitRecord(result.rows[0], result.schema) : null
    },
    async updateRecords(records) {
      const result = await bulkUpdateRows(sourceKey, tableName, credential, records.map(fromConduitRecord))
      return result ? result.rows.map((row) => toConduitRecord(row, result.schema)) : null
    },

    deleteRecord(id) {
      return deleteRows(sourceKey, tableName, credential, [id])
    },
    deleteRecords(ids) {
      return deleteRows(sourceKey, tableName, credential, ids)
    },
  }
}

// Exported for its own unit test (mocked fetch, real request/response
// shapes) — NODE_ENV=test always resolves googleSheetsClient itself to
// the fake, in-memory client below, so this is otherwise unreachable
// in the test environment. Same reasoning as gmail.ts's own
// createGmailApiClient/fastmail.ts's createJmapFastmailClient exports.
export function createHttpSheetsClient(): ConduitSourceClient {
  return {
    // A REST API call needs no real handshake — connect() is synchronous
    // in spirit (cheap, no I/O of its own); it just closes over
    // sourceKey/credential for open() to use later.
    async connect(sourceKey, credential) {
      return {
        async listTables() {
          return cached(`tabs\0${sourceKey}\0${tokenDigest(credential)}`, async () => {
            const response = await sheetsFetch(`${sourceKey}?fields=sheets.properties.title`, credential)
            await throwForStatus(response, 'list tabs')
            const body = (await response.json()) as { sheets?: { properties?: { title?: string } }[] }
            return (body.sheets ?? [])
              .map((sheet) => sheet.properties?.title)
              .filter((title): title is string => Boolean(title))
          })
        },
        open(config) {
          return openHttpTable(sourceKey, credential, tableFromConfig(config))
        },
      }
    },
    // Nothing to tear down for a stateless REST API — see INTEGRATIONS.md's
    // "a source with nothing to tear down can make it a no-op" note.
    async disconnect() {},
    capabilities: () => ({ methods: ALL_HTTP_METHODS, bulkCreate: true }),
  }
}

// --- Fake client: in-memory store, used under NODE_ENV=test so tests never
// make real network calls. Keyed by `${sourceKey}\0${tableName ?? ''}`
// so two different tables of the same conduit-under-test don't collide.
// Mirrors the real client's atomicity and schema-checking contracts (see
// checkFakeSchema/the bulk methods below) so tests exercise the same
// guarantees the controllers actually rely on, not a looser approximation.
//
// Holds ConduitRecord directly, not a stringified FlatRow: unlike a real
// Sheets grid, this store has no reason to flatten field values to text.
// Keeping records in their real shape here means the fake client exercises
// the same round-trip type fidelity (number/boolean/date) a caller gets
// from the real one, instead of a looser approximation.

const fakeStore = new Map<string, ConduitRecord[]>()
const fakeAuthFailures = new Set<string>()
// Mirrors the real client's ensureColumnsForWrite policy: undefined means
// "still bootstrapping, anything goes"; once set, any field name outside
// it is rejected the same way a real established sheet would reject it.
const fakeSchemas = new Map<string, Set<string>>()

function fakeKey(sourceKey: string, tableName: string | undefined): string {
  return `${sourceKey}\0${tableName ?? ''}`
}

function checkFakeAuth(sourceKey: string): void {
  if (fakeAuthFailures.has(sourceKey)) {
    throw new ConduitAuthError(SOURCE, 'Sheets read failed: access token rejected (401)')
  }
}

// Mirrors createFieldsOnSheet's own real logic — never gated the way a
// write is (checkFakeSchema below), idempotent, refuses the reserved id
// column name. Establishing fakeSchemas here for a sourceKey that's
// never been seeded/written to before is deliberate: a genuinely blank
// fake sheet can have fields created for it too, the same as a real one.
function createFakeFields(sourceKey: string, tableName: string | undefined, names: string[]): void {
  checkFakeAuth(sourceKey)
  if (names.includes(ID_COLUMN_NAME)) {
    throw new Error(`"${ID_COLUMN_NAME}" is reserved and can't be used as a field name`)
  }
  const key = fakeKey(sourceKey, tableName)
  const known = fakeSchemas.get(key) ?? new Set<string>()
  for (const name of names) known.add(name)
  fakeSchemas.set(key, known)
}

// Checked/established once per whole batch (fieldsList.length may be > 1),
// same as the real client's ensureColumnsForWrite taking
// unionFieldNames(...).
function checkFakeSchema(key: string, fieldsList: ConduitFields[]): void {
  const known = fakeSchemas.get(key)
  const submittedFieldNames = unionFieldNames(fieldsList)
  if (!known) {
    fakeSchemas.set(key, new Set(submittedFieldNames))
    return
  }
  const unknown = submittedFieldNames.find((name) => !known.has(name))
  if (unknown) throw new ConduitUnknownFieldError(SOURCE, unknown)
}

function appendRowsFake(sourceKey: string, tableName: string | undefined, fieldsList: ConduitFields[]): ConduitRecord[] {
  checkFakeAuth(sourceKey)
  const key = fakeKey(sourceKey, tableName)
  checkFakeSchema(key, fieldsList)
  const rows = fieldsList.map((fields) => ({ id: randomRowId(), fields }))
  fakeStore.set(key, [...(fakeStore.get(key) ?? []), ...rows])
  return rows
}

// Atomic, like the real client: resolves every entry's existing row first
// and bails out (returning null, writing nothing) if any id isn't found,
// before merging or checking schema.
function bulkWriteRowsFake(
  sourceKey: string,
  tableName: string | undefined,
  entries: ConduitRecord[],
  merge: (existing: ConduitFields, fields: ConduitFields) => ConduitFields,
): ConduitRecord[] | null {
  checkFakeAuth(sourceKey)
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
  checkFakeAuth(sourceKey)
  const key = fakeKey(sourceKey, tableName)
  const rows = fakeStore.get(key) ?? []
  if (!ids.every((id) => rows.some((row) => row.id === id))) return false
  fakeStore.set(
    key,
    rows.filter((row) => !ids.includes(row.id)),
  )
  return true
}

// typeof suffices here — unlike the real client, values in this store were
// never flattened to text in the first place, so there's no string to
// parse back.
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
      checkFakeAuth(sourceKey)
      const known = fakeSchemas.get(fakeKey(sourceKey, tableName))
      const rows = fakeStore.get(fakeKey(sourceKey, tableName)) ?? []
      return [...(known ?? [])].map((name) => ({
        name,
        type: inferFakeFieldType(rows.map((row) => row.fields[name] ?? null)),
        // Always true, matching the real client — see INTEGRATIONS.md:
        // there's no column constraint to check for a Sheets-shaped
        // source, fake or real.
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

    async listRecords(page) {
      checkFakeAuth(sourceKey)
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
      checkFakeAuth(sourceKey)
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
 * Test-only: seed a fake spreadsheet's rows. Each row is assigned a fresh
 * id. Also establishes the fake schema from these rows' field names — a
 * seeded sheet models a real pre-existing spreadsheet, whose columns are
 * already fixed, exactly like the real client treats one seen with data
 * already in it.
 */
export function seedFakeSheet(sourceKey: string, rows: ConduitFields[], tableName?: string): ConduitRecord[] {
  const seeded = rows.map((fields) => ({ id: randomRowId(), fields }))
  const key = fakeKey(sourceKey, tableName)
  fakeStore.set(key, seeded)
  fakeSchemas.set(key, new Set(unionFieldNames(rows)))
  return seeded
}

/** Test-only: make the fake client throw ConduitAuthError for this spreadsheet, simulating a revoked Google grant. */
export function simulateFakeAuthFailure(sourceKey: string): void {
  fakeAuthFailures.add(sourceKey)
}

/** Test-only: clear all fake spreadsheet state between tests. */
export function resetFakeSheets(): void {
  fakeStore.clear()
  fakeAuthFailures.clear()
  fakeSchemas.clear()
}

/**
 * Test-only convenience: connect, open, and list a fake table's records in
 * one call, for tests that just want to peek at what's actually stored
 * without spelling out the full connect()/open() dance themselves.
 */
export async function listFakeRecords(sourceKey: string, tableName?: string): Promise<ConduitRecord[]> {
  const source = await googleSheetsClient.connect(sourceKey, 'unused')
  const { records } = await source.open(tableName ? JSON.stringify({ table: tableName }) : undefined).listRecords()
  return records
}

export const googleSheetsClient: ConduitSourceClient =
  process.env.NODE_ENV === 'test' ? createFakeSheetsClient() : createHttpSheetsClient()

// The combined sourceClients registry lives in index.ts, not here —
// this file shouldn't need to import a second implementation's own
// file (fastmail.ts imports shared types from this one; this file
// importing back from it too would be circular for no reason).
