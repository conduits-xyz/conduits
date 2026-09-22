# Writing a data-source integration

The reference for implementing a new `ConduitSourceClient` — for
whoever ends up building one, on this team or outside it. Google
Sheets is the one implementation that ships today (`sheets.ts`) — read
it alongside this guide as the worked example.

## Before you write any code

This project doesn't accept unsolicited pull requests. Open an issue
describing which source and why, before writing any code. This
document describes the contract a new source must satisfy; it isn't
itself an invitation to submit one unannounced.

## The contract

```ts
export type ConduitFieldType = 'string' | 'number' | 'boolean' | 'date'

export type ConduitFields = Record<string, string | number | boolean | null>

// `id` is always required here — a record with no id yet isn't a
// ConduitRecord, it's just ConduitFields (see createRecord below).
export type ConduitRecord = {
  id: string
  fields: ConduitFields
}

export interface ConduitSourceCapabilities {
  methods: readonly string[]
  bulkCreate: boolean
}

export interface ConduitSourceClient {
  connect(sourceKey: string, credential: string): Promise<ConduitSource>
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

Three levels, modeled directly on `open()`/`read()`/`write()`/`close()`:
`connect()` performs the real login/auth step (Google's OAuth
handshake, an IMAP `LOGIN`) and hands back a `ConduitSource` that
closes over `sourceKey`/`credential`, so no later call repeats them.
`disconnect(source)` is the other half of that same pair — an IMAP
`LOGOUT`, releasing a pooled connection, whatever tearing down a
service-level session means for your source. The gateway calls it
once, when it's done with a `ConduitSource`, in a `finally` — so it
runs whether the request succeeded or failed. A source with nothing to
tear down (Google Sheets: plain per-request HTTP calls, no persistent
session) can make it a no-op; that's a legitimate implementation, not
a hack. A `disconnect()` failure is best-effort — log it, don't let it
turn an otherwise-successful response into an error.

This is a distinct concern from `open()`/`ConduitTable`, on purpose:
`connect`/`disconnect` manage the session with the *service*;
`open`/`ConduitTable` manage a *resource* the service gives out once
you're in it (a table, a selected mailbox). Conflating them would mean
a source that only needs one or the other has to fake the other
half — IMAP genuinely needs both (`LOGIN`/`LOGOUT` for the session,
`SELECT` for a mailbox), but switching mailboxes is just another
`SELECT`, no explicit un-select required, which is why `ConduitTable`
has no `close()` of its own today. If a future source ever holds a
real per-table resource that outlives a single call and needs
releasing independently of the whole session, that's an argument for
adding one to `ConduitTable` specifically, then — not for overloading
`disconnect()` to mean two different things.

**`capabilities()`** is the one method on `ConduitSourceClient` that
does no I/O and needs no prior `connect()` — static facts about your
integration as a whole (true for every table/mailbox/base it ever
opens), never something that varies per connected resource or per
request.

- **`methods`** — whichever of `GET`/`POST`/`PUT`/`PATCH`/`DELETE`
  your source can actually do something sensible with; Sheets/
  Airtable-shaped sources return all five, a mailbox-shaped one
  typically doesn't (see "Mapping a mailbox-shaped source" below).
  Both a conduit-management UI's own RACM matrix and conduit save-time
  validation call this to decide which methods are even offered for a
  given `suri_type` — return the true, narrowest set your integration
  supports rather than all five "to be safe"; a method you don't
  return here is never reachable through RACM at all, regardless of
  what `ConduitTable` itself implements.
- **`bulkCreate`** — whether the gateway's bulk-create body
  (`{records: [...]}`, same create endpoint as a single record) is
  safe to accept for your source. `true` only if your `createRecords`
  is genuinely atomic (one request, Sheets' own batched grid write) or
  otherwise safe to retry as a whole batch on partial failure. If
  `createRecords` instead loops over independent, irreversible
  per-record side effects with no such atomicity (Fastmail/Gmail: each
  iteration is a real, already-sent email), return `false` — a
  mid-loop failure has already caused some of those side effects, with
  no way for the response to say which, so a caller's ordinary retry-
  on-failure behavior would repeat them. See "Bulk atomicity" below,
  which covers `replaceRecords`/`updateRecords`/`deleteRecords`
  instead — those are id-addressed and safe to retry regardless of
  atomicity, so `bulkCreate` only ever needs to gate create.

`open()` is synchronous — it does no I/O and resolves nothing. It just
captures which resource the returned `ConduitTable` should operate
against and defers all of that to the table's own async methods. This
is deliberate, not an oversight: a real per-table handshake (IMAP's
`SELECT`) only happens once an actual operation needs it, inside
whichever async method runs first (`listRecords`, `describeFields`,
...) — caching the result there if your source needs to. Every method
after `open()` takes only the data the operation actually needs — no
method anywhere re-passes `sourceKey`, `credential`, or `config`.

- **`sourceKey`** — locates the specific container at your provider (a
  spreadsheet id, a base id, a mailbox) — or, for a provider whose
  credential already identifies one account with no further choice of
  container (Fastmail: the account is the mailbox), whatever else
  needs choosing per conduit instead (Fastmail: which of the account's
  sending identities to send as). Comes from the conduit's
  `suri_object_key`.
- **`config`** passed to `open()` — the conduit's whole `suri_config`,
  JSON-encoded (the gateway passes its raw stored value straight
  through, re-stringified after `parseSuriConfig()` normalizes it —
  see `packages/gateway/middleware/source-client.ts`), not just a table name.
  Every integration receives the same string and reads out whatever
  part of it is its own concern. For a source with nothing beyond
  which table/tab/sheet/folder to use (Sheets: an unqualified range
  already means "the first visible tab," server-side, per
  `sheets.ts`'s own `rangeFor()`; IMAP: `undefined` is just the
  literal name `INBOX`), that's just `.table` — absent/`undefined`
  means "your source's own default." A source whose per-conduit config
  is more than a table name (a mailbox-shaped source's own destination
  address(es) and subject, say — see "Mapping a mailbox-shaped source"
  below) reads its own keys out of the same parsed object instead of
  needing a wider interface — define what it means for yours.
- **`credential`** — an opaque string. What it actually is (a bearer
  token, an API key) and how it's kept fresh is entirely your
  concern, not this interface's — see "Credentials are not part of
  this contract" below.
- **`ConduitRecord`** is a plain struct, not a class, and `id` is never
  optional on it — a record with no id yet isn't a ConduitRecord at
  all, it's bare `ConduitFields` (what `createRecord`/`createRecords`
  take, since there's genuinely nothing else to give them). Every
  method that receives or returns an actual `ConduitRecord`
  (`replaceRecord`/`updateRecord`/`listRecords`/...) can therefore rely
  on `.id` being a real string — no `!` assertions scattered through
  an implementation to paper over "well, it's actually always set by
  this point." `fields` is `Record<string, string | number | boolean |
  null>` — the same scalar set JSON itself allows at a leaf, so a
  parsed request body needs no lossy stringify step to satisfy this
  type. `null` means "clear this field," distinct from omitting the
  key entirely (leave it unchanged) on a partial update. Anything
  richer — a nested object, an array, a `Date` — still needs coercing
  at your own boundary; this contract doesn't carry that through. The
  same `ConduitRecord` shape serves every operation that has an id,
  singular or bulk (bulk is just `ConduitRecord[]`), so there's nothing
  named `...Entry` or `...Input` on top of it.
- **`listTables`/`describeFields`** are the schema/metadata half of
  this contract (which tables exist, which fields a table has) — kept
  separate from `ConduitTable`'s data operations for the same reason a
  filesystem separates `readdir`/`stat` from `read`/`write`.
- **`createField`/`createFields`** are the third schema operation,
  alongside those two — but never called from the gateway's own write
  path. A write is never allowed to implicitly create a field (see
  `ensureColumnsForWrite`'s own comment in `sheets.ts`: an anonymous,
  RACM-unrestricted public conduit silently growing its owner's real
  spreadsheet on any caller's say-so is a real security hole, not
  friction to remove). These exist for the one place that *is* a
  deliberate, authenticated action: a conduit owner defining their own
  schema before any public traffic ever needs it.
  `type` is optional — meaningless for a source with no real column
  types until data appears (Sheets), meaningful for one that needs a
  type up front to create a field at all (Airtable's own field-creation
  API). A source whose schema is fixed rather than user-defined (a
  mailbox's headers, below) throws `ConduitSourceError` here instead —
  same documented-deviation shape `replaceRecord` already uses for
  IMAP, not an optional/omitted method.
- **`describeFields`'s `type`** names either exactly one of
  `ConduitRecord.fields`' own runtime scalar kinds
  (`string`/`number`/`boolean`), or `date` — a refinement of `string`,
  not a fourth runtime kind: a date-typed field's value is still an
  ISO-8601 string in `fields`, the same way JSON Schema's
  `format: date-time` refines a JSON string rather than inventing a
  new JSON type. `null` never gets its own `type` entry either — that
  possibility is what `nullable` is for.
  `nullable` means "this field can legitimately be empty," not "this
  call happened to see a blank" — for Google Sheets
  that's always `true` (any cell can be blank; there's no column
  constraint to check), which is an honest answer, not a placeholder.
  Report both from what your source actually knows (Sheets: infer
  from real values and blanks seen in the column; Airtable/SQLite:
  read straight from that source's own real field/column metadata) —
  never invent a type your source can't back up.
- **`deleteRecord`/`deleteRecords`** take bare ids, not `ConduitRecord`
  — a delete carries no fields, so forcing one through the record
  shape would just mean an unused empty `fields: {}` on every call.
- Singular methods (`createRecord`, `replaceRecord`, ...) exist for
  ergonomics — implement them as thin wrappers around the plural ones,
  not a separate code path (see how `sheets.ts` does it).

## Errors: throw the conduit-domain types, never your own

```ts
throw new ConduitAuthError(SOURCE, message)           // credential no longer works
throw new ConduitSourceError(SOURCE, message, status)  // any other non-2xx from your API
throw new ConduitUnknownFieldError(SOURCE, fieldName)  // write named a field your source doesn't have
```

`SOURCE` is a constant you define — the string identifying your
integration (see "Registering" below; it must match your entry in
`sourceClients`). The gateway's error-handling middleware branches on
`instanceof`, never on which source failed, so it never needs to know
your integration exists. Never let a source-specific error class or a
raw fetch error escape your implementation — catch it and translate.
`connect()` is where a bad or expired credential most naturally
surfaces as `ConduitAuthError`, since that's the one place this
contract actually authenticates.

## Bulk atomicity: real if your API supports it, documented if it doesn't

`replaceRecords`/`updateRecords`/`deleteRecords` return `null`/`false`
for the *whole batch* if any single entry fails to resolve — partial
writes are the one thing this contract asks you to actually rule out.
The alternative — some records written, others silently not, with the
same response either way — is exactly the failure mode this rule
exists to prevent.

If your source's API genuinely can't offer that atomicity (no
transactional multi-row endpoint), document the deviation plainly in
your implementation.

This rule doesn't reach `createRecords` — there's no existing record
to "fail to resolve" on a create, and each item is new, not id-
addressed, so retrying a partial-failure batch isn't automatically
safe the way it is for id-addressed operations. That's what
`ConduitSourceCapabilities.bulkCreate` is for: report `false` if your
`createRecords` can't offer the same all-or-nothing guarantee (or
isn't safe to retry as a whole batch regardless), and the gateway
refuses the bulk-create body outright rather than accepting a request
your integration can't honor safely.

## Row identity: don't trust a remembered position

If your source has real, stable, server-assigned record ids (Airtable
does), use them directly — `id` in `ConduitRecord` is just that id.

If it doesn't — no native per-row id, rows addressed by position
instead (Google Sheets; likely anything else grid-shaped) — see how
`sheets.ts` solves it: a bookkeeping id column (`ID_COLUMN_NAME`,
distinctively named to avoid colliding with a column the user already
has), added on first write if missing, and every operation re-resolves
a row's *current* position by scanning for that column's value
immediately before acting — never by trusting a position read earlier
in the request, still less one cached across requests. A remembered
index can go stale mid-batch (a delete shifts every row below it up by
one) and land a later write on the wrong row — always re-resolve
fresh.

This does mean no compare-and-swap: a concurrent write racing a delete
on the same row is a known, accepted limitation, shared by the
reference implementation — your implementation doesn't need to solve
it either.

## Mapping a mailbox-shaped source (IMAP/JMAP)

The general pattern a mail provider maps onto this contract without
changing its shape. Fastmail (`fastmail.ts`) is the real, shipped
instance of it, over JMAP rather than raw IMAP, with its own RACM
deliberately narrower than what's described generally below —
summarized where it changes something below.

- **`connect(sourceKey, credential)`** — the account's IMAP `LOGIN`
  (JMAP: a session fetch — see `fastmail.ts`). `sourceKey` here is the
  sending identity id chosen at connect time (a JMAP account can have
  more than one — aliases, or addresses on a custom domain) — never
  re-derived from the account's own identity list, so a leaked/reused
  token can't silently change which address a conduit sends as.
  Whatever manages the connection flow resolves and validates it
  before it ever reaches here (see `listJmapIdentities` in
  `fastmail.ts` for the identity lookup this repo provides).
- **`disconnect(source)`** — the matching IMAP `LOGOUT`. A real
  implementation likely pools connections rather than logging in on
  every gateway request, in which case this releases the connection
  back to the pool instead of always closing the socket outright —
  the contract only requires that the session eventually gets torn
  down, not that every `disconnect()` call ends it immediately.
- **`capabilities()`** — Fastmail returns `methods: ['GET', 'POST',
  'DELETE']`: update is deliberately never exposed at all (not even a
  flags/labels-only `PATCH`), so there's nothing to design for what a
  partial update means on a message — see the decision doc.
  `bulkCreate: false` — each `createRecords` iteration is a real,
  independently-sent message (JMAP has no atomic multi-message send),
  so a partial-batch failure can't be reported cleanly enough to make
  retrying the whole batch safe.
- **`listTables()`** — an IMAP `LIST` of folders.
- **`open(config)`** — an IMAP `SELECT` of one folder (`INBOX` when
  `config`'s `table` is absent); the returned `ConduitTable` is that
  selected mailbox. Switching to a different folder is just another
  `SELECT` — IMAP has no explicit "un-select," so `ConduitTable` needs
  no `close()` of its own here. Fastmail's own `config` carries more
  than a folder name: `recipients`/`subject`, the whole message
  template for `POST` — owner-configured in `suri_config`, never taken
  from the submission's own fields (a public, anonymous `POST` must
  never control its own destination).
- **`describeFields()`** — the fixed set of headers this integration
  exposes: `subject`/`from`/`to`/`body` as `string`, `date` as `date`
  — all `nullable: true`, since not every message sets every header.
- **`createField`/`createFields`** — this list is fixed by the
  integration's own code, not stored, user-editable schema — there's
  nothing for an owner to add. Throw `ConduitSourceError` ("this
  source's schema is fixed") for both, the same deviation shape
  `replaceRecord`/`replaceRecords` below already use for a different
  reason.
- **Record `id`** — the message's IMAP UID, stable and server-assigned
  per folder, same as Airtable's own ids — no bookkeeping-column
  workaround needed. (JMAP: the `Email` object's own id, same
  stability property.)
- **`createRecord`/`createRecords`** — IMAP's own `APPEND` command
  saves a message into the selected folder as a first-class operation.
  (JMAP: `Email/set` to create the message, `EmailSubmission/set` to
  actually send it — two calls, not one; see `fastmail.ts` for how a
  failure between them is handled.)
- **`deleteRecord`/`deleteRecords`** — mark `\Deleted` and expunge.
  Fastmail moves to Trash instead of permanent destruction — "delete"
  is realistically archive/trash for a message, not obliteration.
- **`updateRecord`/`updateRecords`** — described generally, for a
  mailbox-shaped source whose own RACM does expose update: an IMAP
  message is immutable once stored, so update only ever means writing
  mutable flags (read/starred) and labels, never content — any other
  field name throws `ConduitUnknownFieldError`, the same way an
  unrecognized column does for Sheets. Fastmail's own RACM never
  offers `PATCH` at all (see `capabilities()` above), so its own
  `updateRecord`/`updateRecords` simply throw `ConduitSourceError`
  (unreachable in practice, same deviation shape as `replaceRecord`
  below) rather than implementing flags/labels logic nothing can call.
- **`replaceRecord`/`replaceRecords`** — no clean IMAP equivalent (you
  can't overwrite a message's content while keeping its UID). This is
  the deviation "Bulk atomicity" above already allows for: throw
  `ConduitSourceError` for these two methods instead of faking a
  replace.
- `ConduitRecord`'s fields cover headers and a plain-text body fine as
  scalars. Attachments and multipart MIME don't fit
  `Record<string, string | number | boolean | null>` either — real
  scope to leave out of a first version, not something that blocks
  shipping headers/body/flags.

**Gmail (`gmail.ts`)** is a second, deliberately narrower instance of
this same mapping — send-only (`capabilities().methods` →
`['POST']` alone, `bulkCreate: false` for the same reason Fastmail's
own is; `listRecords`/`deleteRecord(s)` throw `ConduitSourceError`,
same unreachable-via-RACM deviation shape as Fastmail's own unsupported
methods). Read/archive support would need
`gmail.readonly`/`gmail.modify`, whose Google verification tier
(sensitive vs. the much heavier CASA-audited restricted tier) isn't
confirmed from public sources — a real gap, not a design choice. No
`sourceKey`-chosen identity either, unlike Fastmail: a Gmail send
always goes out as the connected account's own primary address (the
API's own default, no extra scope needed), so `connect()`'s
`sourceKey` is simply unused. The credential Gmail's own provider hands
to `connect()` is a fresh OAuth **access token** (via the same
refresh path Sheets already uses), not a static self-service
token the way Fastmail's is — see `services/gateway/runtime.ts` for
this repo's own Google credential provider.

## Credentials are not part of this contract

`connect()` takes a `credential` as a plain string — how it's obtained
and refreshed is a separate concern, behind `@conduits/gateway`'s own
`GatewayRuntime.getCredential(config)` seam (`packages/gateway/types.ts`).
This repo's own implementation of that seam lives in
`services/gateway/runtime.ts`, registered by `suriType` in its own
`credentialProviders` map, each entry keyed off
`ConduitConfig.credentialRef` (an opaque string `@conduits/gateway`
itself never parses — see that file's own comments for what it means):

```ts
const credentialProviders: Record<string, CredentialGetter> = {
  googleSheets: getGoogleSheetsCredential,
  // yourSource: getYourSourceCredential,
}
```

Why separate: credential models genuinely differ per source in ways
that don't generalize. Google's OAuth token needs periodic refreshing
against Google. Airtable's personal access token is static — no
refresh step exists. A local SQLite base needs no credential at all.
Forcing all three through one shape would either lose information or
invent indirection two real call sites don't justify. Write whatever
function your source's credential model actually needs; `connect()`
only ever sees the resulting string.

Where the durable credential itself lives (if anywhere) is a separate
question from how it's fetched, and it varies by runtime: this repo's
own gateway keeps a static token as a plain `env:NAME` reference resolved
from the process environment (see `packages/config/sources/fastmail.ts`)
or, for an OAuth-style grant shared across conduits, in its own local
credential store keyed by an opaque `credentialRef` (see
`services/gateway/runtime.ts`). A different
`GatewayRuntime` implementation might instead keep that same kind of
shared grant in a real database table. Either way,
`@conduits/gateway` and `packages/conduit` never see or care which —
only a `GatewayRuntime` implementation and, for YAML-driven runtimes, a
`packages/config/sources/*.ts` compiler need to agree on what a given
`credentialRef` string means.

## Registering your implementation

Separate registrations, in separate packages, for a reason:

1. **The data operations** — add your implementation to
   `sourceClients` in `packages/conduit/sheets.ts` (or, better, your
   own file in this package — `sheets.ts` currently holds both the
   shared interface/error types and the one implementation because
   there's only been one; a second implementation should live in its
   own file, importing the shared types from `sheets.ts`):

   ```ts
   export const sourceClients: Record<string, ConduitSourceClient> = {
     googleSheets: googleSheetsClient,
     yourSource: yourSourceClient,
   }
   ```

2. **The credential provider** — add your entry to a `GatewayRuntime`'s
   own `credentialProviders`-shaped dispatch (above). This lives
   per-runtime, not here or in `packages/gateway`, because it's
   runtime-specific: this repo's own is `services/gateway/runtime.ts`;
   a different `GatewayRuntime` implementation would have its own,
   reading and writing whatever it uses to store durable grants.
3. **The human-facing YAML shape** — add a
   `packages/config/sources/<name>.ts` compiler validating your
   source's own `source:` block and producing a `ConduitConfig`. See
   any existing file in that directory for the pattern.

`listTables`/`describeFields` are generic across every source — unlike
a picker-style UI, which would need its own side-channel endpoints for
a source like Sheets that has no other way to expose that information,
a new source needs no side-channel endpoints of its own here; the
gateway calls your `ConduitSource`/`ConduitTable` directly.

## Testing without live credentials

Look at `createFakeSheetsClient()` in `sheets.ts` — an in-memory
`ConduitSourceClient` implementation used whenever
`NODE_ENV === 'test'`, with the same schema-validation and
auth-failure-simulation behavior as the real one
(`seedFakeSheet`/`simulateFakeAuthFailure`/`resetFakeSheets`). Build
the equivalent for your source rather than requiring live credentials
to run the test suite — see `packages/conduit/test/` for what a unit
test against a fake client looks like. For a full gateway-level
integration test built the same way but against a real network service
instead of a fake client, see `services/gateway/test/gateway.test.ts`
(Fastmail, against a real local Mailpit instance — see that file's own
comments for why email specifically isn't faked the way Sheets is).
