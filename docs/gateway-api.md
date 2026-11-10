# Gateway API

This document gives the rules of the wire API that each conduit has.
`packages/gateway` implements these rules, and `services/gateway` runs
them. The terms map to `ConduitConfig` (`packages/gateway/types.ts`)
and to the YAML that `packages/config` compiles
(see [`services/gateway/README.md`](../services/gateway/README.md)).

To learn how to call a conduit, start with
[`docs/developer-guide.md`](developer-guide.md).

## Access control

Each request goes through these checks, in this order:

1. **Allowlist** (optional): the caller's IP must be on the list.
   Otherwise: `403`.
2. **RACM**: the HTTP method must be allowed. Otherwise: `405` with an
   `Allow` header.
3. **Bearer token** (optional, per method): the request must have the
   correct token. Otherwise: `401`.
4. **Throttle**: a limit on the requests from each client address to
   each conduit, which the gateway's operator sets (by default 5 each
   second). An address that keeps sending is refused for a while (by
   default 10 minutes after 50 requests in one second). Otherwise:
   `429` with `Retry-After`.

There are no sessions and no cookies on this API.

### CURI

A **CURI** is the permanent name of a conduit. It is not a URL. The
route where a gateway serves a conduit can change. The CURI does not
change.

> **WARNING:** A CURI is not a secret. Do not use a CURI that is hard
> to guess as access control. Use RACM, the allowlist, and bearer
> tokens.

### Allowlist

Each allowlist entry has this shape:

```
{
  ip: string,                      // required
  comment: string,                 // optional
  status: 'active' | 'inactive'
}
```

- An allowlist with no active entries allows all IPs.
- With active entries, a request without `X-Forwarded-For` gets `403`.

The gateway reads the caller's IP from `X-Forwarded-For`. It uses the
last entry, which your reverse proxy adds. It ignores the other
entries, because callers can set them. Proxies that replace the header
and proxies that append to it both work. The throttle reads the
caller's IP the same way.

A server that calls a conduit for its own visitors, for example one
that serves pages with a form, can pass on each visitor's IP: it sends
`X-Forwarded-For: <visitor's IP>`, and the operator lists the server's
own IP in `CONDUITS_TRUSTED_FORWARDERS`. When the last entry is a
trusted forwarder, the gateway uses the entry before it. Without this,
all of that server's visitors count as one caller.

> **WARNING:** Put exactly one reverse proxy in front of a gateway that
> uses an allowlist. Do not expose the gateway directly to the
> internet. Without the proxy, a caller can send any
> `X-Forwarded-For` value.

### Bearer token

A bearer token protects the methods that you choose. For example,
`GET` can stay open for a public widget, and `PATCH` can require
`Authorization: Bearer <token>`.

- A token applies only to methods that RACM allows.
- The gateway keeps only a SHA-256 hash of the token
  (`ApiKeyRef.tokenHash`), never the token.
- If a method requires a token and no token exists, each request for
  that method gets `401`.
- The gateway checks RACM first. A method that RACM refuses gets `405`,
  not `401`. Thus a caller cannot learn that a token exists.

A token does not give public write access and private read access on
one source. For that, use two conduits on the same source, each with
its own RACM. See `library/pages/contact-validation-flow`.

### Hidden form fields

Each hidden form field rule has one of these shapes:

```
{ fieldName: string, policy: 'drop-if-filled' }
| { fieldName: string, policy: 'pass-if-match', value: string, include: boolean }
```

- **`drop-if-filled`** is a honeypot. People do not see the field, so
  they leave it empty. Bots fill it. The gateway never stores this
  field.
- **`pass-if-match`** requires that the field equals `value`. With
  `include: true`, the gateway stores the field, for example a campaign
  code. With `include: false`, the gateway checks the field but does
  not store it.

When a rule fails, the gateway does not write the record. It returns
the same `201` and the same body shape as a success. A bot cannot see
the difference. The rules apply only to `POST`.

## Routes

The default route is `/<curi>`, with no `/api` prefix. An operator can
bind a conduit to a different path or host (see the routes section of
[`services/gateway/README.md`](../services/gateway/README.md)). Below,
`<route>` is the path where the gateway serves the conduit.

| Route | Does |
|:--|:--|
| `GET <route>` | Reads one page of records. See [List reads](#list-reads). |
| `POST <route>` | Creates one record or several. See [Record shape](#record-shape). |
| `PATCH <route>`, `PUT <route>`, `DELETE <route>` | Updates, replaces, or deletes several records. |
| `GET <route>/:id`, `PUT`, `PATCH`, `DELETE` | Reads, replaces, updates, or deletes one record. |
| `GET <route>/.conduits/readyz` | Returns `204` when the route has an active conduit. No RACM, no token, and no read of the source. |
| `GET <route>/.conduits/schema` | Returns the field names and types. Always requires a token. |
| `OPTIONS <route>`, `OPTIONS <route>/:id`, `OPTIONS <route>/.conduits/schema` | CORS preflight. No conduit lookup and no RACM. |

The methods that a conduit can allow depend on its source:

| Source | Methods | Bulk create |
|:--|:--|:--|
| Google Sheets | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` | Yes |
| Fastmail | `GET`, `POST`, `DELETE` | No: `400` |
| Gmail | `POST` | No: `400` |

### List reads

`GET <route>` returns one page: `{records, nextCursor}`.

- **`?limit=`** sets the page size. It must be a positive whole number,
  not more than the gateway's maximum. Otherwise: `400`. Without
  `limit`, the gateway uses its default. The operator sets both
  values (`CONDUITS_LIST_DEFAULT_LIMIT`, `CONDUITS_LIST_MAX_LIMIT`).
- **`nextCursor`** is `null` on the last page. On other pages, send it
  back without changes as `?cursor=`. You can change `limit` between
  pages.
- A cursor is opaque. Do not make, read, or change a cursor. A cursor
  that the gateway did not issue gets `400 unknown_cursor`.
- Google Sheets records come in id order, which is the order they were
  made in, not the order of the rows. Fastmail emails come newest
  first.
- A page starts after the last record of the page before. Thus a row
  added, deleted or moved while you read the pages does not make a
  record appear twice or not at all. A record made while you read
  comes on a later page (Google Sheets) or not at all (Fastmail, which
  lists newest first).
- If the Fastmail email that a cursor follows is gone (deleted or
  moved out of the folder), the read gets `400 unknown_cursor`. Read
  again from the first page.
- A Google Sheets read can use a copy of the tab for
  `CONDUITS_SHEETS_READ_CACHE_MS`. Thus a large sheet is read from
  Google only once for all its pages. A write through the gateway
  clears the copy at once. An edit made directly in Google Sheets
  shows when the copy expires. This also applies to `GET <route>/:id`.

### Reserved paths

`.conduits` is a reserved path segment. A conduit's route cannot
contain it. The gateway also reserves `/.conduits/readyz` for its own
health check.

### Schema

`GET <route>/.conduits/schema` always requires the bearer token, also
for a conduit that has no other token rule. It is for tools that
others build on your conduit. A widget does not need it. Without a
configured token, the route always returns `401`.

For a conduit that declares its [fields](#fields), the response lists
them: each field's `name`, `type` and, for `single_select` and
`multi_select`, its `options` in the order a form shows them. The
gateway answers without calling the source. For a conduit that declares
none, it lists the source's columns under the field map names, each
with the `type` the source's values suggest (`text`, `number` or
`date`). A `drop-if-filled` field never appears.

### CORS

Each response has `Access-Control-Allow-Origin: *`. Widgets on other
sites call the API directly, so the API must allow all origins. This
is safe because the API uses no cookies. A preflight allows the
`Content-Type`, `Authorization`, `Idempotency-Key` and `If-Match`
headers. Browser code can read the `Request-Id`, `Retry-After`,
`Idempotent-Replayed` and `ETag` response headers
(`Access-Control-Expose-Headers`).

## Record shape

A record goes in as `{fields: {...}}`. It comes out as
`{id, createdTime, etag, fields: {...}}`. The `id`, `createdTime` and
`etag` are not in `fields`, so a column named `id` causes no conflict.
A created email (Gmail, Fastmail) has no `etag`: see
[ETags and If-Match](#etags-and-if-match).

### One record or several

The body shape tells the gateway which one you send:

| Request | One record | Several records (10 or fewer) |
|:--|:--|:--|
| Create (`POST`) | `{fields}` | `{records: [{fields}, ...]}` |
| Update (`PATCH`), replace (`PUT`) | `{fields}` on `<route>/:id` | `{records: [{id, etag, fields}, ...]}` on `<route>` |
| Delete (`DELETE`) | `<route>/:id` | `{ids: [id1, id2], etags: [etag1, etag2]}` on `<route>` |

`etag` and `etags` are optional, unless the conduit requires them: see
[ETags and If-Match](#etags-and-if-match).

These requests get `400`:

- A body member that is not in the table above, for example `feilds`
  or a `note` beside `fields` in a record. The code is
  `unknown_member`, with one `errors` item for each member. The gateway
  does not ignore a member that it does not know.
- A create with an `id`.
- A `PUT` or `PATCH` on `<route>/:id` with an `id` in the body.
- A bulk request with duplicate ids, or more than 10 records.
- A bulk `DELETE` with no ids.

These requests get `404`:

- An id that does not exist.
- A second delete of the same id.

A create returns `201`. Other writes return `200`.

### Bulk writes are all or nothing

If one id in a bulk update, replace, or delete does not exist, the
gateway writes nothing. If one record in a bulk create has an unknown
field, the gateway writes nothing. For Google Sheets, a bulk write
reads the tab once and writes once, for all its records.

### ETags and If-Match

Each record has an ETag: a strong entity tag made from a hash of its
fields as the source holds them. A change to any field, also one made
directly in the sheet, gives a new ETag.

- `GET <route>/:id`, a create, an update and a replace return the
  record's ETag in the `ETag` header and as `etag` in the body. A list
  read and a bulk write give each record an `etag`.
- `PUT`, `PATCH` and `DELETE` on `<route>/:id` can send
  `If-Match: <etag>`. The gateway reads the record and writes only if
  its ETag is still the same. Otherwise the answer is `412`
  `precondition_failed`, with the record's current ETag in the `ETag`
  header, and nothing is written. `If-Match: *` matches any record that
  exists.
- A bulk update or replace can send an `etag` beside each record's
  `id`, and a bulk delete an `etags` list, one for each id in the same
  order. If one record has changed, nothing is written: the answer is
  `412`, with one `errors` item for each changed record, pointing at
  its `etag`.
- Without `If-Match` or `etag`, a write works as before: the last write
  wins. The conduit's owner can require them for every `PUT`, `PATCH`
  and `DELETE`; a write without them then gets `428`
  `precondition_required`. Creates and reads never need them.
- The gateway reads the record, then writes it: two calls to the
  source. A change made in the sheet in the milliseconds between them
  is not detected.
- A Fastmail email does not change, so its ETag does not change. A
  created email (Gmail, Fastmail) has no ETag, since what you sent is
  not the record a later read returns.

To change a record safely: read it, keep its ETag, and send the ETag
with the change. On `412`, read the record again, and show the person
the current values before you write.

### Idempotency keys

A create (`POST`) can carry an `Idempotency-Key` header: 1 to 255
visible ASCII characters that your client makes for the request, for
example a UUID. The gateway keeps the key, for each conduit, with a
hash of the request and its response, for the time its operator sets
(`CONDUITS_IDEMPOTENCY_TTL_MS`, a day in `.env.example`).

- A repeat with the same key and the same body gets the first response
  again, with `Idempotent-Replayed: true`. Nothing is written or sent
  again. This holds for an error too: an email send whose outcome is
  unknown (`502`) is answered with the same `502`, never sent twice.
- The same key with another body: `422` `idempotency_key_reused`.
- The same key while its first request is still running: `409`
  `idempotency_key_in_use`, with `Retry-After`.
- A key that is not 1 to 255 visible ASCII characters: `400`
  `invalid_idempotency_key`.

Send a new key for each new create, and the same key when you retry
that create. A create without the header works as before.

Where the keys are kept depends on the gateway. On conduits.xyz, the
gateway keeps them over a restart. A self-hosted gateway keeps them in
a file when `CONDUITS_STATE_DIR` is set; without it, it keeps them in
its memory: a restart forgets them, so a repeat after a restart is done
again, and two processes do not know each other's keys.

### Content types

The gateway accepts `application/json`,
`application/x-www-form-urlencoded`, and `multipart/form-data` (fields
only, no files). It changes all three into the same `{fields}` or
`{records}` shape.

- A plain name, for example `name=Ada`, goes into `fields`.
- Bracket names work like the JSON shape: `fields[name]=Ada`, or
  `records[0][fields][name]=Ada` for several records.
- A name given more than once, or ending in `[]`, is a list:
  `flavors=Lemon&flavors=Vanilla`, `flavors[]=Lemon`, or
  `fields[flavors][]=Lemon`. A group of checkboxes for a `multi_select`
  field sends one. For a conduit that declares no fields, name the
  group `flavors[]` so that a single ticked box is still a list.
- Form values are all text, so the gateway reads them by their
  [fields](#fields): a `number` field's `12` is the number 12 (an empty
  one is no value), and a `multi_select` field's single value is a
  one-option list. JSON is taken exactly as sent.

### Ids

An id is a fixed-length, base-31 string: a timestamp and a counter.
`createdTime` comes from the id. Treat an id as opaque. You can sort
ids as strings to get the order of creation.

### Unknown fields

A write can use only the fields that the source has. The gateway does
not add a column for an unknown field. It returns `400` with the code
`unknown_field`, and one `errors` item for each unknown field. See
[Errors](#errors).

There is one exception. When a source has no columns, the first write
creates them.

A delete removes the row. It does not only clear the values.

### Fields

A conduit can declare its fields, each with a type (`fields:` in YAML,
`ConduitConfig.fields`). The type decides what a field's value is in
every request and every response, whichever source the conduit uses:

| Type | Value | The gateway refuses |
|:--|:--|:--|
| `text`, `textarea`, `tel` | a string | a value that is not a string |
| `email` | a string | a string that is not an email address (the rule a browser applies to `<input type="email">`) |
| `url` | a string | a string that is not an `http://` or `https://` address |
| `number` | a JSON number | anything else, also a number written as a string (`"12"`) |
| `date` | `"YYYY-MM-DD"` | another format, or a day that does not exist |
| `single_select` | one of the field's `options` | anything else |
| `multi_select` | a list of the field's `options` | a value that is not a list, an option that is not listed, an option given twice |

- `null`, `""` and `[]` mean no value, for every type. The source
  stores an empty value, and a read returns `null` (`[]` for
  `multi_select`).
- A `multi_select` list is stored as one value, the options separated
  by `, `, and every read returns the list. No option, of either
  choice type, can contain a comma.
- A read returns each value typed by its field: a `text` field's
  `01234` stays the string `"01234"`, a `number` field's value is a
  number. A value that does not fit its field, typed into a sheet by
  hand, is returned as a string, unchanged.
- A field the conduit does not declare can have any value except a
  list. A conduit that declares no fields gets its values back as the
  source stores them: for Google Sheets, a number written as a number
  and everything else as a string.

A refused value gets `400` with the code `invalid_value`, and one
`errors` item for each field. The gateway checks before it calls the
source, and a bulk write writes nothing. Options are compared exactly,
capitals included.

The gateway gives Google Sheets every value as it is: a string is never
read as a formula, a number or a date. `=IMPORTXML(...)` in a
submission is stored as that text.

## Errors

Each response has a `Request-Id` header. Give this id when you report
a problem with a request.

Each error is RFC 9457 Problem Details, with the content type
`application/problem+json` and `Cache-Control: no-store`:

```json
{
  "type": "https://github.com/conduits-xyz/conduits/blob/main/docs/gateway-api.md#unknown-field",
  "title": "Unknown field",
  "status": 400,
  "detail": "The conduit has no fields 'email', 'phone'.",
  "code": "unknown_field",
  "errors": [
    { "code": "unknown_field", "field": "email", "pointer": "/fields/email", "detail": "Unknown field: 'email'" },
    { "code": "unknown_field", "field": "phone", "pointer": "/fields/phone", "detail": "Unknown field: 'phone'" }
  ],
  "instance": "urn:request:7k2m9p4q8r3s5t6v2w8x"
}
```

| Member | Always | Meaning |
|:--|:--|:--|
| `type` | Yes | A link to this code in the table below. |
| `title` | Yes | A short summary. The same for each occurrence of the code. |
| `status` | Yes | The HTTP status. It equals the response status. |
| `code` | Yes | A stable code from the table below. Use it in your code. |
| `instance` | Yes | `urn:request:` and the `Request-Id` of the request. |
| `detail` | No | Text about this occurrence, for developers. |
| `errors` | No | One item for each field or member at fault: `code`, `pointer` (a JSON Pointer into the request body), `detail`, and `field` when it is a record field. In a bulk request, the pointer has the record index, for example `/records/2/fields/email`. |
| `retryAfter` | With `429` and `503` | The seconds to wait. The `Retry-After` header has the same value. |

Rules for clients:

- Use `code` to choose what to do and what to show. Do not parse
  `title` or `detail`; their text can change.
- Use `errors` to mark each form field. The gateway reports all unknown
  fields in one response.
- Codes change only in a new version, and `CHANGELOG.md` records each
  change. Treat a code that you do not know by its HTTP status.

### Codes

| Code | Status | Meaning | What your client does |
|:--|:--|:--|:--|
| <a id="invalid-body"></a>`invalid_body` | `400` | The body is not valid JSON or form data, or it does not have the expected shape. | Correct the request. Do not retry it. |
| <a id="id-not-allowed"></a>`id_not_allowed` | `400` | The body has an `id` where it must not: on create, or on `<route>/:id`. | Remove the `id` from the body. |
| <a id="too-many-records"></a>`too_many_records` | `400` | A bulk request has more than 10 records or ids. | Send 10 records or fewer in each request. |
| <a id="duplicate-ids"></a>`duplicate_ids` | `400` | A bulk request has the same id two times. | Send each id once. |
| <a id="bulk-not-supported"></a>`bulk_not_supported` | `400` | The source cannot create several records in one request (Fastmail, Gmail). | Send one record in each request. |
| <a id="invalid-limit"></a>`invalid_limit` | `400` | `limit` is not a whole number from 1 to the gateway's maximum. | Use a `limit` from 1 to the gateway's maximum. |
| <a id="unknown-cursor"></a>`unknown_cursor` | `400` | The gateway did not issue this cursor, or the Fastmail email it follows is gone. | Read again from the first page. |
| <a id="unknown-member"></a>`unknown_member` | `400` | The body has a member that this request does not accept. `errors` lists each one. | Correct the request. Do not retry it. |
| <a id="unknown-field"></a>`unknown_field` | `400` | A field is not in the conduit's field map, or the source has no column for it. `errors` lists each one. | Mark each field in `errors`. Ask the owner to add it. |
| <a id="invalid-value"></a>`invalid_value` | `400` | A value does not fit its [field](#fields)'s type: not an email address, not a number, not one of the options, and so on. `errors` lists each field, and its `detail` says what the field takes. | Mark each field in `errors`, with its `detail`. |
| <a id="invalid-idempotency-key"></a>`invalid_idempotency_key` | `400` | The `Idempotency-Key` header is not 1 to 255 visible ASCII characters. | Send a key such as a UUID. |
| <a id="unauthorized"></a>`unauthorized` | `401` | The bearer token is missing or wrong. | Send the correct bearer token. |
| <a id="forbidden"></a>`forbidden` | `403` | The caller's IP is not on the allowlist. | The caller's network cannot use this conduit. |
| <a id="not-found"></a>`not_found` | `404` | No active conduit has this route. | Check the conduit URL. |
| <a id="record-not-found"></a>`record_not_found` | `404` | An id does not exist. A bulk request writes nothing. | The record does not exist. Reload the list. |
| <a id="method-not-allowed"></a>`method_not_allowed` | `405` | The method is not in the RACM. The `Allow` header lists the allowed methods. | Use a method from the `Allow` header. |
| <a id="idempotency-key-in-use"></a>`idempotency_key_in_use` | `409` | A request with this `Idempotency-Key` is still running. | Wait `retryAfter` seconds, then send the same request again. |
| <a id="precondition-failed"></a>`precondition_failed` | `412` | The record changed since you read it: its ETag is not the one you sent. Nothing was written. A bulk write lists each changed record in `errors`. | Read the record again, then decide whether to write. |
| <a id="idempotency-key-reused"></a>`idempotency_key_reused` | `422` | This `Idempotency-Key` was used for a request with another body. | Make a new key for a new request. |
| <a id="precondition-required"></a>`precondition_required` | `428` | The conduit requires the record's ETag on every change, and the request did not send it (`If-Match`, or `etag` for each record). | Read the record, then send its ETag with the change. |
| <a id="rate-limited"></a>`rate_limited` | `429` | This client address sent too many requests to this conduit: the gateway's [throttle](#access-control). | Wait `retryAfter` seconds, then retry. `conduitFetch` does this. |
| <a id="send-limit-reached"></a>`send_limit_reached` | `429` | The conduit sends email, and its host's limit on how many its owner sends is reached. Nothing was sent. | Show a general error. Do not retry it soon. |
| <a id="internal-error"></a>`internal_error` | `500` | An error in the gateway. | Show a general error. |
| <a id="source-unavailable"></a>`source_unavailable` | `502` | The source failed, did not answer, or refused the owner's credential. | Show a general error. Retry a `POST` only with the same [`Idempotency-Key`](#idempotency-keys): it then gets this answer again, and nothing is sent twice. |
| <a id="source-busy"></a>`source_busy` | `503` | The source is busy: the gateway's request budget for Google Sheets is used up, or Google refused the request for its quota. The gateway did not do the request. | Wait `retryAfter` seconds, then retry, also a `POST`. `conduitFetch` does this. |

## Source config (`suriConfig`)

Each source has its own config. For the YAML shape of each source,
see `packages/config/sources/*.ts`.

- **`table`**: the tab, sheet, or mailbox that the conduit uses.
  Without `table`, the source uses its default.
- **`fieldMap`**: optional. It maps the field names that clients use to
  the column names in the source. Thus a column can change its name
  and clients do not change. For example, clients can use `fullName`
  for the column `Full Name (Required)`. The gateway translates names
  on each write and each read. A name that is not in `fieldMap` does
  not change. `id` cannot be a source or a target in `fieldMap`.

### Google Sheets: the `conduit-id` column

Google Sheets has no row ids. The gateway adds a `conduit-id` column on
the first write. It uses this column to find each row.

> **CAUTION:** Do not delete or rename the `conduit-id` column. If you
> do, the gateway cannot find the existing rows.

There is no protection for concurrent writes. When a write and a
delete change the same row at the same time, the result can be wrong.
