# @conduits/conduit

This package talks to the data sources. It translates between each
source's format and the gateway's wire format.

To add a data source, read [`INTEGRATIONS.md`](INTEGRATIONS.md).

| File | Contents |
|:--|:--|
| `index.ts` | The package's exports, and `sourceCapabilities`: what each source type supports, without a client. |
| `sheets.ts` | The contract (`ConduitSourceClient`, `ConduitSource`, `ConduitTable`), the error types, and the Google Sheets client (`createGoogleSheetsClient`). |
| `fastmail.ts` | Fastmail over JMAP (`createFastmailClient`): read, send through `@m5nv/mail`, and move to Trash (`GET`, `POST`, `DELETE`). |
| `gmail.ts` | Gmail (`createGmailClient`), send only (`POST`), through `@m5nv/mail`. |
| `email-render.ts` | The email body for a submitted record. |
| `mail-source.ts` | What the Gmail and Fastmail sources share: their fields, the recipients and subject a send needs, and a failed `@m5nv/mail` call as the conduit error the gateway maps. |
| `field-map.ts` | The translation between field names and source column names. |
| `record-shape.ts` | The `{fields}` and `{records}` shapes, and the checks on bulk requests. |
| `row-id.ts` | Record ids (`createRowIdMaker`, `createdTimeFromRowId`). |
| `bracket-form.ts` | The translation of bracket form fields (`fields[name]=Ada`) to the JSON shape. |
| `testing.ts` | Test doubles, as `@conduits/conduit/testing`: an in-memory Google Sheets (`createFakeSheets`) and a source that records what it is asked to create (`createRecordingSource`). |

Each client takes its endpoint (the API URL and `fetch`) from the
caller; the Sheets client also takes `now`, and the mail clients `now`
and `makeId`, for each message's Date and Message-ID. Nothing here reads the
environment or the clock.

The code uses the conduit's words (table, record, field), not the words
of one provider.

## Dependencies

This package does not import from a runtime: no database, no schema,
and no auth code. Any `GatewayRuntime` can use it.

This package does not get or refresh credentials. The runtime does
that, because it depends on where the runtime keeps credentials. See
[`INTEGRATIONS.md`](INTEGRATIONS.md#credentials).
