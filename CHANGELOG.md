# Changelog

All notable changes to the Conduits gateway, provider integrations,
config tooling, and widgets are documented here.

## Unreleased

## 0.5.1 - 2026-10-04

### Changed

- **A list read (`GET` on a conduit) returns pages.** Without `limit` it
  returns `CONDUITS_LIST_DEFAULT_LIMIT` rows, and `limit` can't exceed
  `CONDUITS_LIST_MAX_LIMIT`; both are new required settings (1000 in
  `.env.example`). A client that read a large sheet without `limit`
  now gets the first page and a `nextCursor`; follow it until it is
  `null`.
- **`nextCursor` is opaque.** Pass it back unchanged; a bare row
  number is no longer accepted.
- **Google Sheets reads take the whole sheet.** They stopped at row
  10,000 before.
- **Repeated reads of one sheet come from a short cache.** A list read
  reuses a tab's contents for `CONDUITS_SHEETS_READ_CACHE_MS`. A write
  through the gateway clears the cache at once; an edit made in Google
  Sheets shows once the cache expires.
- **Requests to Google Sheets are budgeted per minute,** across the
  gateway and per Google account (`CONDUITS_SHEETS_REQUESTS_PER_MINUTE`,
  `CONDUITS_SHEETS_REQUESTS_PER_MINUTE_PER_ACCOUNT`; required). Above the
  budget, or when Google itself answers 429, the gateway answers `429`
  with `Retry-After` instead of `502`.
- **`createGatewayRouter` takes `listLimits`,** and optionally
  `sourceClients` to replace a source's client, for example one made by
  `createGoogleSheetsClient` with a cache and budget. Sources can throw
  the new `ConduitRateLimitError`.
- **The reactions widget counts every reaction,** following `nextCursor`
  across pages.

### Security

- The IP allowlist now uses the rightmost `X-Forwarded-For` entry, the
  one your reverse proxy adds. Before, it trusted the first entry, so a
  caller could get past the allowlist by sending its own header. Run
  the gateway behind exactly one proxy that sets `X-Forwarded-For`.

## 0.5.0 - 2026-09-12

Rebuilt from the ground up on Remix 3. The gateway REST API,
HTTP-method/IP-allowlist access control, and hidden-form-field spam
filtering all carry over from the previous version — what's below is
what's new or different in this rebuild.

### Removed

- Airtable support, previously available, has been dropped and isn't
  planned to return.

### Added

- Send form submissions straight to an email inbox — Fastmail or
  Gmail — as a data source alongside Google Sheets, with per-conduit
  recipients and subject line.
- A bearer token can be required on specific HTTP methods, on top of
  the existing allowlist/method controls.
- Field mapping — expose public API field names that differ from the
  underlying sheet's own column names.
- Specify a table (tab) for spreadsheets with more than one sheet.
- Rate-limiting is now actually enforced, not just a stored setting.
- Plain HTML forms can redirect visitors back to your own page after
  a successful submission.
- Two new embeddable widgets — a waitlist signup form and a
  thumbs-up/thumbs-down reactions widget — alongside the existing
  contact-form widgets.
