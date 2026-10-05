// row-id.ts isn't re-exported: sheets.ts re-exports createRowIdMaker,
// and a second `export *` would conflict. The test doubles are in
// testing.ts (`@conduits/conduit/testing`).
export * from './sheets.ts'
export * from './field-map.ts'
export * from './record-shape.ts'
export * from './bracket-form.ts'
export * from './fastmail.ts'
export * from './gmail.ts'

import type { ConduitSourceCapabilities } from './sheets.ts'
import { GOOGLE_SHEETS_CAPABILITIES } from './sheets.ts'
import { FASTMAIL_CAPABILITIES } from './fastmail.ts'
import { GMAIL_CAPABILITIES } from './gmail.ts'

// What each source supports, by suri_type, without making a client:
// facts a dashboard can show (which methods a conduit may allow). The
// clients themselves are made by each runtime with its endpoints
// (createGoogleSheetsClient, createFastmailClient, createGmailClient).
export const sourceCapabilities: Record<string, ConduitSourceCapabilities> = {
  googleSheets: GOOGLE_SHEETS_CAPABILITIES,
  fastmail: FASTMAIL_CAPABILITIES,
  gmail: GMAIL_CAPABILITIES,
}
