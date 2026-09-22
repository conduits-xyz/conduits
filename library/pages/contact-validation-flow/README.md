# Contact validation flow

A tutorial in composing three conduits with different access levels into
one moderated submission flow — no framework, no build step, just
`index.html` + `app.js` + `style.css`.

## What it teaches

Create 3 conduits pointing at the same underlying sheet, each with a
different RACM (Request Access Control Map) — the access-control pattern
behind any moderated submission flow, where whoever's submitting,
whoever's reviewing, and whoever's reading the published results should
each only be able to do their own part:

1. **Conduit 1** — write only (`POST`) — what a public submission form posts to
2. **Conduit 2** — read + update (`GET`, `PATCH`) — what a reviewer uses to mark entries valid/invalid
3. **Conduit 3** — read only (`GET`) — what a public results view reads from

Walk through the 4 steps in the page: enter the 3 conduit URLs (persisted
in `localStorage`), write entries through Conduit 1 (manually or with
generated fake data), read and mark validity through Conduit 2, then read
again through Conduit 3 and see the valid/invalid split as a bar chart. A
console panel on the right logs every request as it happens.

## Running it

Open `index.html` directly in a browser — nothing to install or build.

## API shape

The gateway (`packages/gateway`) wraps every record as
`{id, createdTime, fields: {...}}`, separate from a bare `{records:
[...]}` list envelope — a generic display component can enumerate a
record's real data columns (`Object.keys(record.fields)`) without a
denylist for `id`/`createdTime`, and a user's own column literally
named `id` can never collide with ours.

- `POST <conduit-1-url>` with `{fields: {name, email}}` — create a row.
  Returns `201` with `{id, createdTime, fields}`.
- `GET <conduit-2-url>` — returns `{records: [{id, createdTime, fields},
  ...]}`.
- `PATCH <conduit-2-url>/<id>` with `{fields: {valid: 'valid' |
  'invalid'}}` — partial update, preserves fields not included.
- `GET <conduit-3-url>` — same shape as Conduit 2's GET.

`app.js` flattens each `{id, fields: {...}}` record to a plain `{id,
...fields}` object immediately after fetching (`flattenRecord`), so the
rest of the file's logic never deals with the envelope directly.
