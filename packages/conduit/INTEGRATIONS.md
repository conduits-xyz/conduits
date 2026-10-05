# Writing a data-source integration

This document gives the contract for a new `ConduitSourceClient`. Three
integrations ship. Use them as examples:

| Source | File | Shape |
|:--|:--|:--|
| Google Sheets | `sheets.ts` | A grid. All methods. |
| Fastmail | `fastmail.ts` | A mailbox. `GET`, `POST`, `DELETE`. |
| Gmail | `gmail.ts` | Send only. `POST`. |

## Before you write code

We do not accept pull requests that we did not ask for. Open an issue
first. Tell us which source you want to add, and why.

## The contract

```ts
export type ConduitFieldType = 'string' | 'number' | 'boolean' | 'date'

export type ConduitFields = Record<string, string | number | boolean | null>

export type ConduitRecord = {
  id: string
  fields: ConduitFields
}

export interface ConduitSourceCapabilities {
  methods: readonly string[]
  bulkCreate: boolean
}

export interface ConduitSourceClient {
  connect(sourceKey: string, credential: string, fetchImpl?: typeof fetch): Promise<ConduitSource>
  disconnect(source: ConduitSource): Promise<void>
  capabilities(): ConduitSourceCapabilities
}

export interface ConduitSource {
  listTables(): Promise<string[]>
  open(config?: string): ConduitTable
}

export interface ConduitTable {
  describeFields(): Promise<Array<{ name: string; type: ConduitFieldType; nullable: boolean }>>
  listRecords(page?: { cursor?: string; limit?: number }): Promise<{
    records: ConduitRecord[]
    nextCursor: string | null
  }>

  createField(name: string, type?: ConduitFieldType): Promise<void>
  createFields(fields: Array<{ name: string; type?: ConduitFieldType }>): Promise<void>
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
```

`sheets.ts` defines these types.

## Lifecycle

| Call | Does | Rules |
|:--|:--|:--|
| `capabilities()` | Gives facts about the integration. | Synchronous. No I/O. No connection. |
| `connect(sourceKey, credential, fetchImpl?)` | Starts a session with the service. | Use `fetchImpl` for all HTTP calls, if you get one. |
| `open(config)` | Selects one table, tab, or mailbox. | Synchronous. No I/O. |
| `ConduitTable` methods | Read and write data. | Do the first network call here. |
| `disconnect(source)` | Ends the session. | The gateway calls it in a `finally`. Log a failure; do not throw. |

- A source with no session (Google Sheets) can make `disconnect()` do
  nothing.
- A source can keep a pool of connections. Then `disconnect()` returns
  the connection to the pool.
- After `connect()` and `open()`, no method gets `sourceKey`,
  `credential`, or `config` again.

### `capabilities()`

- **`methods`**: the HTTP methods that your source supports. Give the
  smallest correct set. A method that is not in this list is never
  available through RACM.
- **`bulkCreate`**: `true` only if `createRecords` writes all records or
  none. Set `false` if each record causes an action that you cannot
  undo, for example a sent email. With `false`, the gateway refuses a
  bulk create with `400`.

### Parameters

- **`sourceKey`**: finds the container at the provider, for example a
  spreadsheet id. When the credential already gives one account, use
  `sourceKey` for the other choice. Fastmail uses it for the sending
  identity.
- **`config`**: the conduit's full source config, as a JSON string.
  Read your own keys from it. Most sources read only `.table`. Without
  `.table`, use your source's default. Fastmail also reads
  `recipients` and `subject`.
- **`credential`**: an opaque string. See
  [Credentials](#credentials).

## Records and fields

- A `ConduitRecord` always has an `id`. A record without an id is
  `ConduitFields`, for example the input of `createRecord`.
- A field value is a string, number, boolean, or `null`.
- In an update, `null` clears a field. A missing key does not change
  the field.
- Convert other values (objects, arrays, dates) at your boundary.

### Schema methods

| Method | Rules |
|:--|:--|
| `listTables()` | The tables, tabs, or folders. |
| `describeFields()` | Each field: `name`, `type`, `nullable`. Report only what the source knows. `date` is an ISO-8601 string. `nullable: true` when the field can be empty. |
| `createField(s)` | Only the owner calls these, to define the schema. The gateway never calls them during a write. A source with a fixed schema throws `ConduitSourceError`. |
| `deleteField(s)` | Only the owner calls these. Ignore a name that is not a column. A source without columns to delete throws `ConduitSourceError`. |

> **WARNING:** A write must never create a field. A public conduit
> that adds columns for any caller lets anyone change the owner's
> source.

### Reads: `listRecords(page)`

- Without `page`, return all records, with `nextCursor: null`. The
  gateway does this to find one record by id.
- With `page`, return `limit` records or fewer, from `cursor`.
- `nextCursor` is `null` on the last page. Otherwise it is a string
  that your source understands.
- The gateway wraps your cursor before it sends it to a caller. Thus
  you can change the cursor's format and callers do not change.

### Singular and plural methods

Write the plural method. Make the singular method call it, as
`sheets.ts` does.

## Errors

Throw only these error types:

```ts
throw new ConduitAuthError(SOURCE, message)                         // the credential does not work
throw new ConduitRateLimitError(SOURCE, message, retryAfterSeconds) // the source says "not now"
throw new ConduitSourceError(SOURCE, message, status)               // any other failure
throw new ConduitUnknownFieldError(SOURCE, fieldNames)              // a write used fields that the source does not have
```

| Error | Gateway response |
|:--|:--|
| `ConduitUnknownFieldError` | `400`, code `unknown_field`, with one `errors` item for each name. Give all unknown names, not only the first. The gateway translates column names back to the client's field names. |
| `ConduitAuthError` | `502`, code `source_unavailable`. The gateway also calls `GatewayRuntime.invalidateCredential`. |
| `ConduitRateLimitError` | `503`, code `source_busy`, with `retryAfter` and `Retry-After` set to `retryAfterSeconds`. |
| `ConduitSourceError` | `502`, code `source_unavailable`. The gateway logs the error. |

- `SOURCE` is a constant that names your integration. It must equal
  the source type a runtime gives your client under in
  `GatewayDeps.sourceClients`.
- Catch provider errors and fetch errors. Translate them to these
  types. Do not let another error type out.
- A bad credential usually appears in `connect()`. Throw
  `ConduitAuthError` there.

## Bulk writes: all or nothing

`replaceRecords`, `updateRecords`, and `deleteRecords` must write all
records or none. If one id does not exist, write nothing, and return
`null` or `false`.

If your provider cannot do this, write the deviation in a comment in
your implementation.

`createRecords` has no ids to check. Use `capabilities().bulkCreate`
for it. See [`capabilities()`](#capabilities).

## Row identity

If your source has stable ids, use them as `id`.

If your source finds rows only by position (Google Sheets), do what
`sheets.ts` does:

1. Keep an id column (`ID_COLUMN_NAME`). Add it on the first write.
2. Before each operation, find the row's current position from that
   column.

> **CAUTION:** Do not keep a row position from before, not even within
> one request. A delete moves all the rows below it, and a later write
> can then change the wrong row.

There is no protection for concurrent writes to one row. Your
integration does not need to add it.

## Mailbox sources

A mailbox maps to the contract as follows. `fastmail.ts` uses JMAP.

| Contract | Mailbox |
|:--|:--|
| `connect` | Log in. Fastmail: get the JMAP session. `sourceKey` is the sending identity. Do not choose it again from the account's identities. |
| `disconnect` | Log out, or return the connection to the pool. |
| `listTables` | The folders. |
| `open` | Select one folder (`INBOX` by default). Fastmail also reads `recipients` and `subject` from `config`. |
| `describeFields` | Fixed: `subject`, `from`, `to`, `body` (`string`), `date` (`date`). All `nullable: true`. |
| `createField(s)` | Throw `ConduitSourceError`. The schema is fixed. |
| Record `id` | The message id from the server. |
| `createRecord(s)` | Send a message. Fastmail: `Email/set`, then `EmailSubmission/set`. |
| `deleteRecord(s)` | Fastmail moves the message to Trash. |
| `updateRecord(s)`, `replaceRecord(s)` | Throw `ConduitSourceError`. A message cannot change. |

- Take `recipients` and `subject` only from the owner's config. Never
  take them from the submitted fields. Otherwise a public caller can
  send email to any address.
- Fastmail: `methods: ['GET', 'POST', 'DELETE']`, `bulkCreate: false`.
- Gmail: `methods: ['POST']`, `bulkCreate: false`. It sends from the
  account's primary address, so it does not use `sourceKey`. Its
  credential is an OAuth access token.
- Attachments and multipart MIME do not fit `ConduitFields`.

## Credentials

`connect()` gets the credential as a string. It does not get or refresh
it. A `GatewayRuntime` does that, with `getCredential(config)` and
`invalidateCredential(config)` (`packages/gateway/types.ts`).

- `ConduitConfig.credentialRef` names the credential. Only the runtime
  and the source compiler know its format.
- `services/gateway/runtime.ts` is the runtime in this repository. It
  reads Fastmail tokens from the environment (`env:NAME`). It reads
  Google grants from its credential store (`google:<name>`) and
  refreshes them.
- A different runtime can keep credentials in a database.
  `@conduits/gateway` and `@conduits/conduit` do not know where they
  are.

## Register your integration

1. Put the client in its own file in `packages/conduit`, as a factory
   that takes its endpoint (the API URL and `fetch`) and anything else
   it reads from outside, such as the clock. Export it from `index.ts`,
   and add its capabilities to `sourceCapabilities` there.
   ```ts
   export function createYourSourceClient(endpoint: YourSourceEndpoint): ConduitSourceClient
   ```
   Then build it in each runtime's composition, with the provider's
   URL: `services/gateway/providers.ts` for the self-hosted gateway.

2. Handle your credential in `getCredential` and
   `invalidateCredential` in `services/gateway/runtime.ts`.
3. Write a compiler for your `source:` YAML block in
   `packages/config/sources/<name>.ts`. Add it to `sourceCompilers` in
   `packages/config/compile.ts`.
4. Add your type to `SUPPORTED_SOURCE_TYPES` in
   `services/gateway/config.ts`.

The gateway calls `listTables` and `describeFields` directly. You do
not need other endpoints.

## Tests without live credentials

- `packages/conduit/test/` tests each client with a mocked `fetch`.
- `@conduits/conduit/testing` has test doubles that tests inject in
  place of a client: an in-memory Google Sheets (`createFakeSheets`,
  with `seed`, `records`, `failAuth` and `forbid`) and a source that
  records what it is asked to create (`createRecordingSource`). Add one
  for your source if other packages' tests need it.
- `services/gateway/test/gateway.test.ts` tests the self-hosted
  gateway's composition with a recording Fastmail source.
