# Changelog

This file records the notable changes to the Conduits gateway, the
provider integrations, the config tools, and the widgets.

## Unreleased

## 0.6.1 - 2026-10-05

### Changed

- **A body member that a request does not accept gets `400`
  `unknown_member`,** with one `errors` item and a JSON Pointer for each
  member, for example `feilds`, or `note` beside `fields` in a record.
  Before, the gateway ignored it.
- Each response has a `Request-Id` header. Each problem has the same id
  in `instance` (`urn:request:<id>`) and `Cache-Control: no-store`.
  Browser code can read `Request-Id` and `Retry-After`
  (`Access-Control-Expose-Headers`).
- `createGatewayRouter` takes an optional `requestId` function, which
  makes each request's id.

### Added

- `problemResponder(codes, docsUrl)` builds Problem Details for a host's
  own API in the gateway's shape; `problemResponse` is the gateway's
  own. `findUnknownMembers` lists the members of a body that a route
  does not accept.

### Fixed

- The self-hosted gateway's last-resort `500` is Problem Details, not
  plain text.

## 0.6.0 - 2026-10-04

### Breaking

- **Errors are RFC 9457 Problem Details.** Each error response has the
  content type `application/problem+json`. It has the members `type`,
  `title`, `status`, and `code`. It also has `detail`, `errors`, and
  `retryAfter` when they apply. The top-level `error` string is gone. Use `code` to
  handle an error. See `docs/gateway-api.md#errors` for all codes.
- **An unknown-field error names all unknown fields.** `errors` has one
  item for each field, with a JSON Pointer to it, also in bulk requests.
  `ConduitUnknownFieldError` now takes `fieldNames` (a list), not
  `fieldName`. `checkKnownFields` now takes a list of records.
- **A busy source answers `503`, not `429`.** When the Google Sheets
  request budget is used up, or Google refuses a request for its quota,
  the gateway returns `503` with the new code `source_busy`, and
  `retryAfter` and `Retry-After`. `429` `rate_limited` now means only
  the conduit's throttle: this caller sent too many requests. A
  `source_busy` request was not done, so a retry is safe, also for a
  `POST`. In observations, `503` is a `providerError`, not `rejected`.

### Added

- `@conduits/config` reads the gateway settings for any host:
  - `listLimitsFromEnv()` reads `CONDUITS_LIST_DEFAULT_LIMIT` and
    `CONDUITS_LIST_MAX_LIMIT`.
  - `googleSheetsOptionsFromEnv()` reads the `CONDUITS_SHEETS_*`
    settings for `createGoogleSheetsClient`.
  - `positiveIntegerFromEnv(name)` reads one required positive whole
    number.

### Changed

- The self-hosted gateway does not start when
  `CONDUITS_LIST_DEFAULT_LIMIT` is more than `CONDUITS_LIST_MAX_LIMIT`.
  Before, it started and returned `400` for each list read without
  `limit`.
- The documentation is shorter and uses Simplified Technical English.
  It now gives the list-read rules (`limit`, `nextCursor`) and the two
  limits (`429` and `503`), and starts with safe defaults for clients.
- The widgets and the tutorials read the new error format. A widget
  asks the visitor to wait after a `429` or a `503`.

### Fixed

- The self-hosted gateway now declares its dependency on
  `@conduits/conduit`.
- `/.conduits/schema` uses the source clients given to
  `createGatewayRouter`. Before, it used the default Google Sheets
  client, so schema reads were outside the request budget.
- The `contact-validation-flow` tutorial reads all pages of records.
  Before, it read only the first page.

## 0.5.1 - 2026-10-04

### Changed

- **A list read (`GET <route>`) returns one page.** Without `limit`, it
  returns `CONDUITS_LIST_DEFAULT_LIMIT` records. `limit` cannot be more
  than `CONDUITS_LIST_MAX_LIMIT`. Both settings are new and required
  (1000 in `.env.example`). A client that reads a large sheet now gets
  the first page and a `nextCursor`. Follow `nextCursor` until it is
  `null`.
- **`nextCursor` is opaque.** Send it back without changes. The gateway
  no longer accepts a row number as a cursor.
- **Google Sheets reads get the full sheet.** Before, they stopped at
  row 10,000.
- **Reads of one sheet use a short cache.** A list read uses a copy of
  the tab for `CONDUITS_SHEETS_READ_CACHE_MS`. A write through the
  gateway clears the copy at once. An edit made in Google Sheets shows
  when the copy expires.
- **Requests to Google Sheets have a budget for each minute,** for the
  gateway and for each Google account
  (`CONDUITS_SHEETS_REQUESTS_PER_MINUTE`,
  `CONDUITS_SHEETS_REQUESTS_PER_MINUTE_PER_ACCOUNT`; required). Above
  the budget, or when Google returns `429`, the gateway returns `429`
  with `Retry-After`. Before, it returned `502`.
- **`createGatewayRouter` takes `listLimits`.** It also takes an
  optional `sourceClients`, to replace the client of a source, for
  example with one from `createGoogleSheetsClient`. Sources can throw
  the new `ConduitRateLimitError`.
- **The reactions widget counts all reactions.** It follows
  `nextCursor` through all pages.

### Security

- The IP allowlist now uses the last `X-Forwarded-For` entry, which
  your reverse proxy adds. Before, it used the first entry, so a caller
  could get past the allowlist with its own header. Put exactly one
  proxy that sets `X-Forwarded-For` in front of the gateway.

## 0.5.0 - 2026-09-12

A new version, built on Remix 3. The REST API, the access control
(HTTP methods and IP allowlist), and the hidden-form-field spam
filters work as before. This list gives what is new or different.

### Removed

- Airtable support. It will not return.

### Added

- Fastmail and Gmail as data sources: a submission goes to an email
  inbox. Each conduit has its own recipients and subject.
- A bearer token for the HTTP methods that you choose, in addition to
  the allowlist and the method controls.
- Field maps: public field names that are different from the column
  names in the sheet.
- A `table` (tab) setting for spreadsheets with more than one sheet.
- A throttle that the gateway enforces. Before, it was only a stored
  setting.
- `_redirect` for plain HTML forms: after a successful submission, the
  browser goes back to your page.
- Two new widgets: a waitlist signup and thumbs-up/thumbs-down
  reactions, in addition to the contact-form widgets.
