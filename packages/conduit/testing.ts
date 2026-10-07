import {
  ConduitAuthError,
  ConduitSourceError,
  GOOGLE_SHEETS_CAPABILITIES,
  ID_COLUMN_NAME,
  createRowIdMaker,
  tableFromConfig,
  unionFieldNames,
  type ConduitFieldType,
  type ConduitFields,
  type ConduitRecord,
  type ConduitSourceCapabilities,
  type ConduitSourceClient,
  type ConduitTable,
} from './sheets.ts'
import { ConduitUnknownFieldError } from './field-map.ts'

// Test doubles for code that takes a ConduitSourceClient: tests inject
// them as they would a real client. No production code imports this.

const SOURCE = 'googleSheets'

export interface FakeSheets {
  client: ConduitSourceClient
  // Sets a table's rows, each with a new id, and fixes its schema to
  // their field names, as for an existing spreadsheet.
  seed(sourceKey: string, rows: ConduitFields[], tableName?: string): ConduitRecord[]
  records(sourceKey: string, tableName?: string): ConduitRecord[]
  // The spreadsheet's calls throw ConduitAuthError, as for a revoked
  // grant.
  failAuth(sourceKey: string): void
  // ConduitSourceError(403), as for a grant without access to the file.
  forbid(sourceKey: string): void
}

// An in-memory Google Sheets client with the real one's atomicity and
// schema rules (checkSchema, the bulk methods). Values are kept as
// given, as the real client writes them (RAW) and reads them back
// (unformatted). `now` makes row ids.
export function createFakeSheets(now: () => number): FakeSheets {
  const makeRowId = createRowIdMaker(now)
  // Keyed by `${sourceKey}\0${tableName ?? ''}`.
  const store = new Map<string, ConduitRecord[]>()
  // As in ensureColumnsForWrite: no entry means any field is accepted;
  // once set, unknown fields are rejected.
  const schemas = new Map<string, Set<string>>()
  const authFailures = new Set<string>()
  const forbidden = new Set<string>()

  const keyOf = (sourceKey: string, tableName: string | undefined) => `${sourceKey}\0${tableName ?? ''}`

  function checkAccess(sourceKey: string): void {
    if (authFailures.has(sourceKey)) throw new ConduitAuthError(SOURCE, 'Sheets read failed: access token rejected (401)')
    if (forbidden.has(sourceKey)) throw new ConduitSourceError(SOURCE, 'Sheets read failed: caller lacks access to this file (403)', 403)
  }

  // Checked once per batch, as ensureColumnsForWrite is.
  function checkSchema(key: string, fieldsList: ConduitFields[]): void {
    const known = schemas.get(key)
    const names = unionFieldNames(fieldsList)
    if (!known) {
      schemas.set(key, new Set(names))
      return
    }
    const unknown = names.filter((name) => !known.has(name))
    if (unknown.length > 0) throw new ConduitUnknownFieldError(SOURCE, unknown)
  }

  function openTable(sourceKey: string, tableName: string | undefined): ConduitTable {
    const key = keyOf(sourceKey, tableName)
    const rows = () => store.get(key) ?? []

    function createFields(names: string[]): void {
      checkAccess(sourceKey)
      if (names.includes(ID_COLUMN_NAME)) throw new Error(`"${ID_COLUMN_NAME}" is reserved and can't be used as a field name`)
      const known = schemas.get(key) ?? new Set<string>()
      for (const name of names) known.add(name)
      schemas.set(key, known)
    }

    // Unknown names are skipped.
    function deleteFields(names: string[]): void {
      checkAccess(sourceKey)
      const known = schemas.get(key)
      if (known) for (const name of names) known.delete(name)
      for (const row of rows()) for (const name of names) delete row.fields[name]
    }

    function append(fieldsList: ConduitFields[]): ConduitRecord[] {
      checkAccess(sourceKey)
      checkSchema(key, fieldsList)
      const added = fieldsList.map((fields) => ({ id: makeRowId(), fields }))
      store.set(key, [...rows(), ...added])
      return added
    }

    // Atomic: null, and nothing written, if any id isn't found.
    function write(entries: ConduitRecord[], merge: (existing: ConduitFields, fields: ConduitFields) => ConduitFields): ConduitRecord[] | null {
      checkAccess(sourceKey)
      const current = rows()
      const indexes = entries.map((entry) => current.findIndex((row) => row.id === entry.id))
      if (indexes.some((index) => index === -1)) return null
      const merged = entries.map((entry, i) => ({ id: entry.id, fields: merge(current[indexes[i]!]!.fields, entry.fields) }))
      checkSchema(key, merged.map((record) => record.fields))
      indexes.forEach((rowIndex, i) => {
        current[rowIndex] = merged[i]!
      })
      store.set(key, current)
      return merged
    }

    function remove(ids: string[]): boolean {
      checkAccess(sourceKey)
      const current = rows()
      if (!ids.every((id) => current.some((row) => row.id === id))) return false
      store.set(key, current.filter((row) => !ids.includes(row.id)))
      return true
    }

    const replace = (_existing: ConduitFields, fields: ConduitFields) => fields
    const update = (existing: ConduitFields, fields: ConduitFields) => ({ ...existing, ...fields })

    return {
      async describeFields() {
        checkAccess(sourceKey)
        return [...(schemas.get(key) ?? [])].map((name) => ({
          name,
          type: fieldType(rows().map((row) => row.fields[name] ?? null)),
          // Always true, as in the real client.
          nullable: true,
        }))
      },
      async createField(name) {
        createFields([name])
      },
      async createFields(fields) {
        createFields(fields.map((field) => field.name))
      },
      async deleteField(name) {
        deleteFields([name])
      },
      async deleteFields(names) {
        deleteFields(names)
      },
      async listRecords(page) {
        checkAccess(sourceKey)
        const all = rows()
        const offset = page?.cursor ? Number(page.cursor) : 0
        const slice = all.slice(offset, offset + (page?.limit ?? all.length))
        const next = offset + slice.length
        return { records: slice, nextCursor: next < all.length ? String(next) : null }
      },
      async createRecord(fields) {
        return append([fields])[0]!
      },
      async createRecords(fieldsList) {
        return append(fieldsList)
      },
      async replaceRecord(record) {
        return write([record], replace)?.[0] ?? null
      },
      async replaceRecords(records) {
        return write(records, replace)
      },
      async updateRecord(record) {
        return write([record], update)?.[0] ?? null
      },
      async updateRecords(records) {
        return write(records, update)
      },
      async deleteRecord(id) {
        return remove([id])
      },
      async deleteRecords(ids) {
        return remove(ids)
      },
    }
  }

  return {
    client: {
      async connect(sourceKey) {
        checkAccess(sourceKey)
        return {
          async listTables() {
            return [...new Set([...store.keys()].filter((key) => key.startsWith(`${sourceKey}\0`)).map((key) => key.slice(sourceKey.length + 1)))].filter(Boolean)
          },
          open: (config) => openTable(sourceKey, tableFromConfig(config)),
        }
      },
      async disconnect() {},
      capabilities: () => GOOGLE_SHEETS_CAPABILITIES,
    },
    seed(sourceKey, rows, tableName) {
      const key = keyOf(sourceKey, tableName)
      const seeded = rows.map((fields) => ({ id: makeRowId(), fields }))
      store.set(key, seeded)
      schemas.set(key, new Set(unionFieldNames(rows)))
      return seeded
    },
    records: (sourceKey, tableName) => [...(store.get(keyOf(sourceKey, tableName)) ?? [])],
    failAuth: (sourceKey) => void authFailures.add(sourceKey),
    forbid: (sourceKey) => void forbidden.add(sourceKey),
  }
}

// Values are stored typed, so typeof is enough.
function fieldType(values: (string | number | boolean | null)[]): ConduitFieldType {
  const present = values.filter((value) => value !== null)
  if (present.length > 0 && present.every((value) => typeof value === 'number')) return 'number'
  if (present.length > 0 && present.every((value) => typeof value === 'boolean')) return 'boolean'
  return 'string'
}

export interface RecordedCreate {
  sourceKey: string
  credential: string
  // The conduit's suri_config, as open() received it.
  config: string | undefined
  fields: ConduitFields
}

// A source that records each created record and supports nothing else,
// for tests of what a gateway hands a send-only source such as Fastmail
// or Gmail. How those clients compose a message is tested with them.
export function createRecordingSource(capabilities: ConduitSourceCapabilities): { client: ConduitSourceClient; created: RecordedCreate[] } {
  const created: RecordedCreate[] = []
  const unsupported = async (): Promise<never> => {
    throw new ConduitSourceError('recording', 'Not supported by the recording source', 501)
  }
  return {
    created,
    client: {
      async connect(sourceKey, credential) {
        return {
          listTables: unsupported,
          open: (config) => ({
            describeFields: unsupported,
            createField: unsupported,
            createFields: unsupported,
            deleteField: unsupported,
            deleteFields: unsupported,
            listRecords: unsupported,
            async createRecord(fields) {
              created.push({ sourceKey, credential, config, fields })
              return { id: `recorded-${created.length}`, fields }
            },
            createRecords: unsupported,
            replaceRecord: unsupported,
            replaceRecords: unsupported,
            updateRecord: unsupported,
            updateRecords: unsupported,
            deleteRecord: unsupported,
            deleteRecords: unsupported,
          }),
        }
      },
      async disconnect() {},
      capabilities: () => capabilities,
    },
  }
}
