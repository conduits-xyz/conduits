import type { OAuthTokens } from 'remix/auth'
import type { GooglePurpose } from '@conduits/config'

import { readJsonFileOrDefault, writeJsonFileAtomic } from './atomic-file.ts'

// A grant includes its clientId and clientSecret, so a running gateway
// doesn't need GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET; only creating
// or replacing a grant does.
export interface StoredGoogleGrant {
  name: string
  purpose: GooglePurpose
  clientId: string
  // Optional: Google's "Desktop app" clients may have no secret, or an
  // empty one the token exchange doesn't need.
  clientSecret?: string
  tokens: OAuthTokens
  // Optional, unused by this package and unset by the CLI. For a caller
  // that provisions credentials for others: `generation` changes only
  // when a new authorization replaces this one (not on refresh), and
  // `status: 'invalid'` marks a generation the provider has rejected,
  // keeping the grant so that generation isn't reinstated later.
  generation?: number
  status?: 'active' | 'invalid'
}

type StoreFile = Record<string, Partial<Record<GooglePurpose, StoredGoogleGrant>>>

// expiresAt is stored as an ISO string; this turns it back into a Date
// for every grant.
function reviveGrant(grant: StoredGoogleGrant): StoredGoogleGrant {
  const { expiresAt } = grant.tokens
  if (!expiresAt || expiresAt instanceof Date) return grant
  return { ...grant, tokens: { ...grant.tokens, expiresAt: new Date(expiresAt) } }
}

function readStore(storePath: string): StoreFile {
  const parsed = readJsonFileOrDefault<StoreFile>(storePath, {})
  const revived: StoreFile = {}
  for (const [name, byPurpose] of Object.entries(parsed)) {
    revived[name] = {}
    for (const [purpose, grant] of Object.entries(byPurpose ?? {})) {
      revived[name]![purpose as GooglePurpose] = reviveGrant(grant)
    }
  }
  return revived
}

export function loadGoogleGrant(storePath: string, name: string, purpose: GooglePurpose): StoredGoogleGrant | null {
  return readStore(storePath)[name]?.[purpose] ?? null
}

export function saveGoogleGrant(storePath: string, grant: StoredGoogleGrant): void {
  const store = readStore(storePath)
  store[grant.name] = { ...store[grant.name], [grant.purpose]: grant }
  writeJsonFileAtomic(storePath, store)
}

// Removes one grant, leaving the rest of the store. For grants without
// generation tracking (a CLI-authorized grant, or a disconnect); callers
// that track generations use markGoogleGrantInvalid.
export function deleteGoogleGrant(storePath: string, name: string, purpose: GooglePurpose): void {
  const store = readStore(storePath)
  const forName = store[name]
  if (!forName || !forName[purpose]) return
  delete forName[purpose]
  if (Object.keys(forName).length === 0) delete store[name]
  writeJsonFileAtomic(storePath, store)
}

// Marks a grant invalid, keeping its generation and material (see
// StoredGoogleGrant). Does nothing if no grant is stored under this
// name and purpose.
export function markGoogleGrantInvalid(storePath: string, name: string, purpose: GooglePurpose): void {
  const store = readStore(storePath)
  const grant = store[name]?.[purpose]
  if (!grant) return
  store[name] = { ...store[name], [purpose]: { ...grant, status: 'invalid' } }
  writeJsonFileAtomic(storePath, store)
}
