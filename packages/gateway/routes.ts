import { route, get, post, put, patch, del } from 'remix/routes'

// Single-record routes carry an :id; bulk routes operate on the bare
// table URL, records addressed inside the body instead. PUT replaces a
// row in full, PATCH merges into the existing row, both at the same
// path.
export const gatewayRoutes = route('api/:curi', {
  list: get('/'), // ?cursor=...&limit=...
  write: post('/'), // single (`{fields}`) or bulk (`{records:[{fields}]}`) create
  bulkUpdate: patch('/'), // `{records:[{id,fields}]}`
  bulkReplace: put('/'), // `{records:[{id,fields}]}`
  bulkDestroy: del('/'), // `{ids: [id1, id2]}`
  // Nested so it gets its own controller/middleware pipeline (see
  // schema-controller.ts).
  schema: route('schema', {
    read: get('/'), // field names/types this conduit's table has
  }),
  // Nested for its own controller/pipeline (readyz-controller.ts).
  // Confirms the curi resolves to an active conduit; no RACM or
  // bearer-token gate, no data-source access.
  readyz: route('readyz', {
    read: get('/'),
  }),
  item: route(':id', {
    read: get('/'),
    replace: put('/'),
    update: patch('/'),
    destroy: del('/'),
  }),
})
