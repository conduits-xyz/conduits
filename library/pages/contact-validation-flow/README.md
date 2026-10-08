# Contact validation flow

This tutorial uses three conduits on one sheet, each with a different
RACM. Together they make a moderated submission flow. It has no
framework and no build step: `index.html`, `app.js`, `style.css`.

## What it shows

Each person can do only their own part:

| Conduit | RACM | Used by |
|:--|:--|:--|
| 1 | `POST` | The public submission form. |
| 2 | `GET`, `PATCH` | The reviewer, who marks each entry valid or invalid. |
| 3 | `GET` | The public results page. |

The page has four steps:

1. Enter the three conduit URLs. The page keeps them in `localStorage`.
2. Write entries through conduit 1. Type them, or generate test data.
3. Read the entries and mark them through conduit 2.
4. Read the entries through conduit 3. A bar chart shows valid and
   invalid entries.

A console panel shows each request.

## Run it

Open `index.html` in a browser. There is nothing to install or build.

## Requests

| Request | Body | Response |
|:--|:--|:--|
| `POST <conduit-1-url>` | `{fields: {name, email}}` | `201 {id, createdTime, fields}` |
| `GET <conduit-2-url>` | none | `200 {records, nextCursor}` |
| `PATCH <conduit-2-url>/<id>` | `{fields: {valid: 'valid' or 'invalid'}}` | `200`. Fields that you do not send do not change. |
| `GET <conduit-3-url>` | none | The same as conduit 2. |

- `fetchAllRecords` in `app.js` follows `nextCursor`, so the page reads
  all records, not only the first page.
- `flattenRecord` changes each `{id, fields}` record to `{id, ...fields}`
  after the read.
- The page waits 220 ms between writes. By default, the gateway's
  throttle allows 5 requests each second from one address.
