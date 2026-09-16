# @conduits/conduit

The functional core of the gateway: talking to a conduit's underlying
data source, and translating between its native shape and the
gateway's own wire format.

**Adding a new data source? See [`INTEGRATIONS.md`](INTEGRATIONS.md)**
for the full extension-point contract.

- `sheets.ts` — the `ConduitSourceClient`/`ConduitSource`/`ConduitTable`
  interfaces, the `sourceClients` registry every implementation plugs
  into, the conduit-domain error types
  (`ConduitAuthError`/`ConduitSourceError`/`ConduitUnknownFieldError`)
  every integration throws, and the Google Sheets implementation.
  `connect(sourceKey, credential)` and `open(config)` resolve those
  three once each, not per method call — conduit's own vocabulary
  throughout, not Google Sheets', so a second implementation reads as
  a peer, in the same terms.
- `fastmail.ts` — a mailbox-shaped source over JMAP: read/send/archive
  (`GET`/`POST`/`DELETE`), a per-conduit "send as" identity picker.
- `gmail.ts` — the Gmail API, send-only (`POST` alone — see
  INTEGRATIONS.md's own note on why `GET`/`DELETE` aren't supported).
- `field-map.ts` — translates widget-facing field names to real
  source columns and back.
- `record-shape.ts` — the `{fields}`/`{records}` envelope: wrapping,
  extracting, and bulk-request validation.
- `row-id.ts` — the id scheme (`randomRowId`, `createdTimeFromRowId`).
- `bracket-form.ts` — expands bracket-notation form fields
  (`fields[name]=Ada`) into the same shape as JSON bodies.

## Scope, deliberately

Three real implementations ship today: Google Sheets, Fastmail, and
Gmail (send-only). The interface is shaped so a plain key-value-store
or SQL-backed source could implement it too, without changing its
shape — see INTEGRATIONS.md's note on mapping a mailbox-shaped source
for how a mail provider fits this same contract.

## Zero runtime-specific dependencies

Nothing here imports from any specific runtime's own schema, database,
or auth — that's what lets any `GatewayRuntime` implementation, from
this repo's own database-free `services/gateway` to a hypothetical
DB-backed one, depend on this package identically. Credential
acquisition (Google OAuth token refresh, or whatever a future source
needs) stays out of this package for the same reason in reverse: it's
tightly coupled to whichever runtime is asking, not backend-agnostic.
See `INTEGRATIONS.md` for exactly where that split happens and why.
