# @conduits/conduit

This package talks to the data sources. It translates between each
source's format and the gateway's wire format.

To add a data source, read [`INTEGRATIONS.md`](INTEGRATIONS.md).

| File | Contents |
|:--|:--|
| `index.ts` | The `sourceClients` registry: one client for each source type. |
| `sheets.ts` | The contract (`ConduitSourceClient`, `ConduitSource`, `ConduitTable`), the error types, and the Google Sheets client. |
| `fastmail.ts` | Fastmail over JMAP: read, send, and move to Trash (`GET`, `POST`, `DELETE`). |
| `gmail.ts` | Gmail, send only (`POST`). |
| `email-render.ts` | The email body for a submitted record. |
| `field-map.ts` | The translation between field names and source column names. |
| `record-shape.ts` | The `{fields}` and `{records}` shapes, and the checks on bulk requests. |
| `row-id.ts` | Record ids (`randomRowId`, `createdTimeFromRowId`). |
| `bracket-form.ts` | The translation of bracket form fields (`fields[name]=Ada`) to the JSON shape. |
| `mailpit-test-client.ts` | A Mailpit client for tests. |

The code uses the conduit's words (table, record, field), not the words
of one provider.

## Dependencies

This package does not import from a runtime: no database, no schema,
and no auth code. Any `GatewayRuntime` can use it.

This package does not get or refresh credentials. The runtime does
that, because it depends on where the runtime keeps credentials. See
[`INTEGRATIONS.md`](INTEGRATIONS.md#credentials).
