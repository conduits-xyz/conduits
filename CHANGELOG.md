# Changelog

All notable changes to the Conduits gateway, provider integrations,
config tooling, and widgets are documented here.

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
