import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import type { StoredGoogleGrant } from './google-credential-store.ts'

// For tests: a path for a store file in a new temporary directory. The
// file, and any directory `file` names, doesn't exist yet.
export function tempStorePath(file = 'credentials.json'): string {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'conduits-credential-store-')), file)
}

// For tests: a Google grant named "personal", for Sheets, with `tokens`.
export function googleGrant(tokens: StoredGoogleGrant['tokens'], overrides: Partial<StoredGoogleGrant> = {}): StoredGoogleGrant {
  return { name: 'personal', purpose: 'sheets', clientId: 'client-id', clientSecret: 'client-secret', tokens, ...overrides }
}
