// row-id.ts isn't re-exported directly — sheets.ts already re-exports its
// one external consumer, randomRowId; a second `export *` here would
// collide with it.
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

// The registration point for every ConduitSourceClient implementation,
// keyed by the exact string a conduit's `suri_type` column holds.
// Adding a new source means adding a second entry here — see
// INTEGRATIONS.md for the full contract a new entry must satisfy.
// Combined here, not in either implementation's own file, so
// sheets.ts/fastmail.ts each only ever import shared types one
// direction, never each other.
//
// This lives here, not in packages/gateway, because it has zero
// request/config-shaped dependencies — same reasoning as the rest of
// this package. What reads a resolved ConduitConfig's `suriType` and
// looks it up in this map is packages/gateway/middleware/
// source-client.ts instead — this package has no concept of "a
// conduit" or "a request," only of sources.
export const sourceClients: Record<string, ConduitSourceClient> = {
  googleSheets: googleSheetsClient,
  fastmail: fastmailClient,
  gmail: gmailClient,
}
