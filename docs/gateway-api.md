# Gateway API

The wire contract every conduit exposes, running as `services/gateway`.
This describes behavior owned entirely by `packages/gateway`; the concepts
below map directly onto `ConduitConfig` (`packages/gateway/types.ts`)
and the human-facing YAML shape `packages/config` compiles into it (see
`services/gateway/README.md`).

## Access control

**racm + allowlist is the default security model** — every request is
gated by which HTTP methods are allowed (`racm`) and, optionally, by
source IP (`allowlist`). No session cookie, no account to log into on
this API surface at all.

A conduit's **CURI** ("conduit URI") is its stable, permanent public
identifier — a proper noun, not itself a URL: the concrete route(s) a
CURI is reachable at can change (a custom domain, a different
Gateway) without the CURI itself changing. Choosing a semantic or
opaque CURI is a usability choice, not a security control — CURI
opacity is not authentication. Enforce access with racm/allowlist/a
bearer token, not by relying on a CURI being hard to guess.

### allowlist shape

```
{
  ip: string,       // required
  comment: string,  // optional
  status: 'active' | 'inactive'
}
```

An allowlist consisting only of inactive entries allows any IP, same
as no allowlist at all.

### Bearer token

A second, orthogonal gate on top of curi/racm/allowlist, for specific
methods — e.g. leaving `GET` open to a public widget while requiring a
secret `Authorization: Bearer <token>` header for `PATCH`. Not a
replacement for the curi/racm model, and not the mechanism for
splitting public-write from private-read on the same underlying
source either — see `library/examples/contact-validation-flow` for that (two
conduits pointing at the same source, each with its own racm).

- The configured set of token-required methods only ever gates a
  method `racm` already allows.
- Only a SHA-256 hash of the token is ever kept (`ConduitConfig.bearerTokenHash`)
  — never the plaintext.
- If a method is marked token-required but no token hash is configured,
  the gateway fails closed — every request for that method gets a bare
  `401`, never treated as ungated.
- Checked after RACM, before throttle: a method RACM already rejects
  gets a plain `405`, never a `401` that would leak "this conduit has
  a token" for a method nobody could call anyway.

### hidden_form_field (hff) shape

```
{ fieldName: string, policy: 'drop-if-filled' }
| { fieldName: string, policy: 'pass-if-match', value: string, include: boolean }
```

Discriminated by policy: `include`/`value` don't mean the same thing
(or anything) for both. `drop-if-filled` is a honeypot — a field real
users never see or fill, but form-filling bots do — and it's always
excluded from the source, unconditionally. `pass-if-match` requires a
`value` (a submission must equal it to pass) and its own `include`:
`true` means the field is a deliberate piece of data to keep (e.g. a
campaign token), `false` means validate it but never store it.

Either policy failing behaves identically: the gateway responds
exactly as if the submission succeeded (`201`, same shape as a real
success response, so the failure is never distinguishable from
outside) without writing the row. Hidden-form-field rules only ever
apply to create (`POST`), never to update or replace.

## Routes

A conduit's route defaults to `/<curi>` at whatever host serves it —
no `/api` prefix. An operator can bind a conduit to a different
concrete path/host instead (see `services/gateway/README.md`'s own
routing section); the CURI stays the same identifier either way.

Below, `<route>` means "wherever this conduit is actually bound" —
`/<curi>` by default:

`GET/POST <route>` (list/create — create accepts single-or-bulk, list
accepts `?cursor=`/`?limit=`), `PATCH/PUT/DELETE <route>` (bulk
update/replace/destroy), `GET/PUT/PATCH/DELETE <route>/:id` (single
read/replace/update/destroy), `GET <route>/.conduits/readyz` (confirms
the route resolves to an active conduit — no RACM or bearer-token
gate, and no data-source access at all, so it can't fail because of a
revoked credential or similar; the widgets call this for their own
health check before wiring up), `GET <route>/.conduits/schema` (field
names/types this conduit's table has, under their widget-facing names
if a `fieldMap` is set — a `drop-if-filled` hff field can never appear
here, but a `pass-if-match` field with `include: true` does), `OPTIONS
<route>`, `OPTIONS <route>/:id`, and `OPTIONS <route>/.conduits/schema`
(CORS preflight, answered directly — no conduit lookup, no RACM
check).

`.conduits` is a reserved path segment (visually similar to
`.well-known`, not claiming to be one) — a conduit's own route can
never use it as one of its own path segments, and a Gateway process
also reserves the top-level `/.conduits/readyz` for its own liveness,
independent of any one conduit.

**`/schema` always requires the bearer token, unconditionally** —
unlike every other route, which is only token-gated for methods
explicitly opted into. Schema is a narrower-audience capability
(third-party tooling built against someone else's conduit, not the
default copy-paste widget flow, which gets its fields baked in
directly) and is never public, even for a conduit with no methods
marked token-required at all. If no bearer token is configured,
`/schema` is simply unreachable (`401`).

**Every response carries `Access-Control-Allow-Origin: *`.** This API
is meant to be called directly from a framework-free web component
embedded on someone else's page, so it has to be readable
cross-origin. There's no session cookie here to protect, so an
unrestricted origin carries none of the risk it would on a
cookie-authenticated route. The preflight response's
`Access-Control-Allow-Headers` includes `Authorization` alongside
`Content-Type`, for conduits that use a bearer token.

## Record shape

**A record is always `{fields: {...}}` on the way in and `{id,
createdTime, fields: {...}}` on the way out**, never a bare object of
field values — this keeps `id`/`createdTime` out of a record's actual
data namespace entirely, so a generic display component can enumerate
real columns (`Object.keys(record.fields)`) without a denylist, and a
user's own column literally named `id` can never collide with ours.
Create returns `201`. A create/update/replace either takes a single
record (`{fields}`) or a bulk array (`{records: [{fields}, ...]}`, `id`
required per entry for update/replace, forbidden for create) on the
*same* endpoint — shape alone decides which. Bulk delete takes `{ids:
[id1, id2]}` as a JSON body, same as every other write on this API —
not a query string. A create request supplying its own `id` is
rejected, duplicate ids within one bulk update/replace/delete are
rejected, and bulk create/update/delete is capped at 10 records per
request.

A single-record PUT/PATCH rejects a body that also carries an `id`
(path and body must not both specify it). Deleting an id a second time
404s. A bulk DELETE naming no ids at all 400s. A honeypot/pass-if-match
drop on create returns the same `201` a real create would — the
response code itself must not be a signal a bot could use to detect
the trap.

**Bulk writes are atomic and issue one API call per request, not one
per record**, for sources that support it (`ConduitSourceCapabilities.bulkCreate`
— see `packages/conduit/INTEGRATIONS.md`). If any id in a bulk
update/replace/delete doesn't resolve to a real row, nothing in the
batch is written, not just the bad entry; same for a bulk create where
any record names an unrecognized field.

The gateway accepts three request content types —
`application/json`, `application/x-www-form-urlencoded`, and
`multipart/form-data` (fields only, no file uploads) — normalizing all
three to the identical `{fields}`/`{records}` shape. A plain field name
(`name=Ada`) is treated as that field under `fields` automatically;
bracket notation (`fields[name]=Ada`, or `records[0][fields][name]=Ada`
for bulk) works exactly like the JSON shape for anyone who wants it
explicit.

`createdTime` is derived from the id itself — ids are a fixed-width,
sortable, base-31-encoded string (a timestamp plus a same-millisecond
tiebreaker counter), not a random suffix, so a client can treat ids as
opaque but string-sortable-by-creation-order strings.

**A write can only use field names the source already has, with one
exception: bootstrapping a genuinely blank source.** Once a source has
at least one real field column, a write naming a field that isn't
already a column is rejected with a `400
{"error": "Unknown field: '...'"}` rather than silently adding it. Any
other non-2xx from the real source (a deleted/renamed table, the
provider's own rate limit, a transient 5xx) gets a clean JSON `502`
instead — a different limit from the conduit's own `throttle`: the
source's own limit is external, unconfigurable, and reported as `502`,
not `429`.

Deletes actually remove the row, not just clear its values.

## Source config (`suriConfig`)

Source-specific config: which table/tab to use, and an optional
field-name mapping — see each `packages/config/sources/*.ts` compiler
for the exact YAML shape per source type.

**`table`** — which tab/sheet/mailbox a conduit reads and writes.
Absent/undefined means "the source's own default."

**`fieldMap`** — widget-facing field name → the source's actual column
name, both directions, entirely optional. A conduit's public API
surface stays stable even when the underlying column is renamed, and
never has to expose an awkward real column name (e.g. `"Full Name
(Required)"`) verbatim to clients. Inbound fields are translated to
real column names right before every write, and every row read back is
translated to widget-facing names right before being wrapped into the
response envelope. A name absent from `fieldMap` passes through
unchanged. `id` is never a valid mapping target either direction.

Google Sheets specifically has no native per-row id: the gateway
requires (and adds, if missing, on first write) a `conduit-id` column
to locate a row on every subsequent read/update/delete. **This column
must never be deleted or renamed** — doing so breaks every existing
row's addressability for that conduit. There's no compare-and-swap: a
concurrent write racing a delete on the same row is a known
limitation.
