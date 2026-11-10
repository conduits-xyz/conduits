# Changelog

This file records the notable changes to the Conduits gateway, the
provider integrations, the config tools, and the widgets.

## 0.6.18 - 2026-11-09

### Added

- A Google Sheets connection gives `tabLink(table)`, the spreadsheet's
  link opened at that tab; `@conduits/conduit` exports
  `spreadsheetUrl(spreadsheetId, gid?)`.
- `npm run fastmail:identities -- --credential env:NAME` lists the
  identities a Fastmail API token can send as, with the `identityId`
  line for `conduits.yaml`.
- At startup, the self-hosted gateway warns about each conduit whose
  Google grant is missing from the credential store, with the command
  that adds it.

### Changed

- The settings readers of `@conduits/config` and `compileConduits` take
  the environment they read as an argument (`platform`) instead of
  reading `process.env`. `PlatformEnvironment` is exported.
- The self-hosted gateway's messages name the commands as you run them
  (`npm run auth:google …`), and its startup line says it listens on
  every network interface.
- The widget library's `config.js` names the product's domain
  (`productDomain`); on any other host, the demo pages call the
  gateway they were loaded from. A demo page opened from a file
  suggests a conduit URL on a gateway of your own.
- Node.js 24.3 or newer is required.
- `getSheetId` and `Cell` are no longer exported.

### Documentation

- The gateway service's README has "Run it on a server": a reverse
  proxy, restarts and `CONDUITS_STATE_DIR`, authorizing Google for a
  server without a browser, and keeping the secrets.

## 0.6.17 - 2026-11-09

### Fixed

- A Google Sheets column named `id` is an ordinary field, as
  `docs/gateway-api.md` says; it no longer replaces the record's id.
- The library's Copy button gives `<script type="module">`, as each
  widget's README does.

### Removed

- Unused exports: `createFileCredentialStore`, `CredentialStore` and
  `FileCredentialStorePaths` from `@conduits/credential-store`;
  `parseEnvRef` from `@conduits/config`; `encodeHeader` and
  `formatDate` from `@m5nv/mail`.

## 0.6.16 - 2026-11-07

### Fixed

- A bulk create with an `id` in one of its records is refused as
  `400 id_not_allowed`, as a single create is, not `invalid_body`.

## 0.6.15 - 2026-11-07

- No change in behavior.

## 0.6.14 - 2026-11-06

### Added

- **ETags and If-Match.** Each record has an ETag, in the `ETag` header
  and as an `etag` member in bodies. `PUT`, `PATCH` and `DELETE` accept
  `If-Match`, and bulk writes an `etag` for each record. A record that
  changed is refused with `412 precondition_failed` and nothing is
  written. A conduit can require them (`requireIfMatch` in
  `conduits.yaml`); a write without them is then
  `428 precondition_required`. CORS allows `If-Match` and exposes
  `ETag`.
- Integrations: the replace, update and delete methods take an optional
  `RecordCondition` (`checkRecordCondition`); a failure is
  `ConduitPreconditionError`.

## 0.6.13 - 2026-11-06

### Changed

- **List reads page by record id, not by row position.** A row added,
  deleted or moved while a caller pages no longer repeats or skips a
  record. Google Sheets records come in the order they were made.
  A Fastmail cursor whose email is gone is `400 unknown_cursor`
  (`ConduitCursorError` for integrations; `pageById` pages by id).

## 0.6.12 - 2026-11-06

### Added

- **Idempotency keys.** A create can carry an `Idempotency-Key` header.
  A repeat with the same key and body, within
  `CONDUITS_IDEMPOTENCY_TTL_MS` (required), gets the first response
  again (`Idempotent-Replayed: true`) and writes or sends nothing. The
  same key with another body is `422 idempotency_key_reused`, one still
  running `409 idempotency_key_in_use`, a malformed key
  `400 invalid_idempotency_key`. Keys are kept in `CONDUITS_STATE_DIR`,
  or in memory without it (`createMemoryIdempotencyStore`,
  `createSqliteIdempotencyStore`). CORS allows the header and exposes
  `Idempotent-Replayed`.
- The widgets send an `Idempotency-Key` with each create.

## 0.6.11 - 2026-11-06

### Added

- With `CONDUITS_STATE_DIR` set, the throttle keeps its counts in a
  SQLite file, shared by the gateway's processes on one host and kept
  over a restart (`createSqliteThrottleStore`).

## 0.6.10 - 2026-11-06

### Changed

- **The widgets are ES modules.** Load each with
  `<script type="module" src="…">`, from a web server; the widgets'
  README says how to serve a folder.
- **A widget keeps the visitor's place.** After an error, what the
  visitor typed and the focus stay.

## 0.6.9 - 2026-11-06

### Fixed

- The first write to a sheet of more than 29,791 rows without a
  `conduit-id` column no longer fails; every row gets its id.

## 0.6.8 - 2026-11-06

### Added

- `randomBase31(length)` from `@conduits/gateway`: random text in the
  alphabet of record ids and bearer tokens.

### Changed

- **An API key's id is text.** `ApiKeyRef.id` and
  `GatewayObservation.apiKeyId` are strings, not numbers.

## 0.6.7 - 2026-11-06

### Fixed

- **A record id is never repeated.** After the 29,791st id in one
  millisecond, a further id is refused instead of repeating an earlier
  one.

## 0.6.6 - 2026-11-02

### Fixed

- A Fastmail conduit lists the Inbox newest first, so paging no longer
  shows a message twice or skips one.

## 0.6.5 - 2026-10-10

### Added

- `ConduitSourceCapabilities.sendsEmail`: `true` for Fastmail and
  Gmail.
- `GatewayRuntime.allowSend(config)`, optional: asked before each email
  is sent. When it answers `false`, the request is refused with
  `429 send_limit_reached` and nothing is sent.

## 0.6.4 - 2026-10-07

### Changed

- **The throttle counts each client address.** One busy caller no
  longer blocks the others, and an address that keeps sending is
  refused for a while. The limits are required settings:
  `CONDUITS_THROTTLE_REQUESTS`, `CONDUITS_THROTTLE_WINDOW_MS`,
  `CONDUITS_THROTTLE_BAN_AFTER` and `CONDUITS_THROTTLE_BAN_MS`. The
  per-conduit `throttle` setting is gone.
- `GatewayDeps` takes `throttle` (`{ limits, store }`) and
  `trustedForwarders`.

### Added

- **Trusted forwarders.** A server that calls conduits for its own
  visitors can send each visitor's IP in `X-Forwarded-For`. When its IP
  is in `CONDUITS_TRUSTED_FORWARDERS`, the allowlist and the throttle
  use the visitor's IP. `clientIpFrom` reads a request's client IP the
  same way.
- Test helpers in each package's `testing` export, for code that uses
  the packages.

## 0.6.3 - 2026-10-06

### Added

- **Field types.** A conduit can declare its fields, each with a type:
  `text`, `textarea`, `email`, `tel`, `url`, `number`, `date`,
  `single_select` or `multi_select` (`fields:` in `conduits.yaml`).
  - A value that doesn't fit its field is refused with
    `400 invalid_value`, one `errors` item for each field, before the
    source is called.
  - Every read returns each value typed by its field.
  - The schema endpoint lists the declared fields, with their types and
    options.
- **Form bodies.** A form name given more than once, or ending in `[]`,
  is a list, so a group of checkboxes works.

### Changed

- **Google Sheets stores values exactly as sent.** Text such as
  `=IMPORTXML(...)` is stored as text, not run as a formula, and
  `01234` keeps its leading zero.
- **`ConduitConfig` requires `fields`** (`{}` for a conduit that
  declares none).
- A request the gateway refuses or drops never reaches the source.

## 0.6.2 - 2026-10-05

### Added

- **`@m5nv/mail`** sends email through JMAP (Fastmail) or the Gmail API,
  with an API token, an access token or a Workspace service account. A
  send returns `auth_failed`, `rejected`, `rate_limited`, `unavailable`
  or `outcome_unknown`. The Fastmail and Gmail conduits send through it.
  A sending limit is `503 source_busy` with `Retry-After`; a send whose
  outcome is unknown is `502`.

### Changed

- **The packages take their dependencies from the caller:** provider
  URLs, `fetch`, the clock and request ids. `createGatewayRouter`
  requires `sourceClients`, `clock` and `requestId`. The source clients
  are `createGoogleSheetsClient`, `createGmailClient` and
  `createFastmailClient`. Test doubles are in `@conduits/conduit/testing`.

### Fixed

- A Fastmail conduit no longer answers `502` after sending a message,
  so a client that retried no longer sends it twice.

## 0.6.1 - 2026-10-05

### Changed

- A body member that a request does not accept gets
  `400 unknown_member`, with a JSON Pointer for each one. Before, it was
  ignored.
- Each response has a `Request-Id` header, also in each problem's
  `instance`. Browser code can read `Request-Id` and `Retry-After`.

### Added

- `problemResponder(codes, docsUrl)` builds Problem Details in the
  gateway's shape for a host's own API.

### Fixed

- The self-hosted gateway's last-resort `500` is Problem Details.

## 0.6.0 - 2026-10-04

### Breaking

- **Errors are RFC 9457 Problem Details** (`application/problem+json`),
  with `type`, `title`, `status` and `code`, and `detail`, `errors` and
  `retryAfter` when they apply. Use `code` to handle an error; see
  `docs/gateway-api.md#errors`.
- **An unknown-field error names every unknown field**, each with a
  JSON Pointer, also in bulk requests.
- **A busy source answers `503 source_busy`,** with `Retry-After`;
  `429 rate_limited` now means only the conduit's throttle. A
  `source_busy` request was not done, so a retry is safe.

### Added

- `@conduits/config` reads the gateway's settings for any host
  (`listLimitsFromEnv`, `googleSheetsOptionsFromEnv`,
  `positiveIntegerFromEnv`).

### Changed

- The self-hosted gateway doesn't start when
  `CONDUITS_LIST_DEFAULT_LIMIT` is more than `CONDUITS_LIST_MAX_LIMIT`.
- The documentation starts with safe defaults for clients, and gives the
  list-read rules and the two limits (`429` and `503`).
- The widgets ask the visitor to wait after a `429` or a `503`.

### Fixed

- Schema reads count against the Google Sheets request budget.
- The `contact-validation-flow` tutorial reads every page of records.

## 0.5.1 - 2026-10-04

### Changed

- **A list read returns one page.** Follow `nextCursor` until it is
  `null`. `CONDUITS_LIST_DEFAULT_LIMIT` and `CONDUITS_LIST_MAX_LIMIT`
  are new and required. `nextCursor` is opaque.
- **Google Sheets reads get the whole sheet,** not only the first 10,000
  rows.
- **Reads of one sheet use a short cache**
  (`CONDUITS_SHEETS_READ_CACHE_MS`); a write through the gateway clears
  it.
- **Requests to Google Sheets have a budget for each minute,** for the
  gateway and for each Google account
  (`CONDUITS_SHEETS_REQUESTS_PER_MINUTE`,
  `CONDUITS_SHEETS_REQUESTS_PER_MINUTE_PER_ACCOUNT`; required).
- The reactions widget counts the reactions on every page.

### Security

- The IP allowlist uses the last `X-Forwarded-For` entry, which your
  reverse proxy adds, so a caller can't get past it with its own
  header. Put exactly one proxy that sets `X-Forwarded-For` in front of
  the gateway.

## 0.5.0 - 2026-09-12

A new version. The REST API, the access control (HTTP methods and IP
allowlist) and the hidden-form-field spam filters work as before.

### Removed

- Airtable as a source.

### Added

- Fastmail and Gmail as sources: a submission goes to an email inbox,
  with each conduit's own recipients and subject.
- A bearer token for the HTTP methods that you choose.
- Field maps: public field names that differ from the sheet's column
  names.
- A `table` (tab) setting for spreadsheets with more than one sheet.
- A throttle that the gateway enforces.
- `_redirect` for plain HTML forms: after a submission, the browser goes
  back to your page.
- Two widgets: a waitlist signup and thumbs-up/thumbs-down reactions.
