# Pages

Tutorials that show how to build on a conduit. They are HTML, CSS, and
JavaScript, with no framework and no build step. Read them and change
them. Do not embed them as they are. For widgets that you can embed
without changes, see [`../widgets/`](../widgets/README.md).

| Tutorial | Shows |
|:--|:--|
| [`progressive-enhancement-form/`](progressive-enhancement-form/README.md) | One form that works without JavaScript, and better with `fetch()`. Start here. |
| [`contact-validation-flow/`](contact-validation-flow/README.md) | Three conduits with different RACM on one sheet: public write, review, and public read. |

## The two calls you need

```js
// Create a record
await fetch(conduitUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fields: { name: 'Ada', done: false } }),
})

// Read the first page of records
const { records, nextCursor } = await fetch(conduitUrl).then((r) => r.json())
```

To read all pages, follow `nextCursor`. See the
[developer guide](../../docs/developer-guide.md#read-all-records).

## Automation tools

Zapier, n8n, and Make can call a conduit with a webhook step. No code
is necessary.

1. Set the webhook URL to the conduit URL, for example
   `https://gateway.example/XXXXXXXX`.
2. To write a record, send `POST` with `{"fields": {...}}`.
3. To read records, send `GET`. It returns one page. If `nextCursor` is
   not `null`, send `GET` again with `?cursor=<nextCursor>`.

For all request and response shapes, see
[`docs/gateway-api.md`](../../docs/gateway-api.md).
