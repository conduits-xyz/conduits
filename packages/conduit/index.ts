// row-id.ts isn't re-exported: sheets.ts re-exports randomRowId, and a
// second `export *` would conflict.
export * from './sheets.ts'
export * from './field-map.ts'
export * from './record-shape.ts'
export * from './bracket-form.ts'
export * from './fastmail.ts'
export * from './gmail.ts'

import type { ConduitSourceClient } from './sheets.ts'
import { googleSheetsClient } from './sheets.ts'
import { fastmailClient } from './fastmail.ts'
import { gmailClient } from './gmail.ts'

// Every ConduitSourceClient, keyed by suri_type. Add new integrations
// here (contract in INTEGRATIONS.md). Kept out of the implementation
// files so they don't import each other.
// packages/gateway/middleware/source-client.ts looks up a conduit's
// suriType here.
export const sourceClients: Record<string, ConduitSourceClient> = {
  googleSheets: googleSheetsClient,
  fastmail: fastmailClient,
  gmail: gmailClient,
}
