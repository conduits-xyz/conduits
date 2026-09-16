import * as path from 'node:path'
import * as os from 'node:os'
import type { OAuthTokens } from 'remix/auth'
import type { GooglePurpose } from '@conduits/config'

import { readJsonFileOrDefault, writeJsonFileAtomic } from './atomic-file.ts'

// A grant is self-contained on purpose (see this file's own callers):
// clientId/clientSecret travel with the grant instead of being read
// from the environment every time a gateway starts, so a running
// gateway never depends on GOOGLE_CLIENT_ID/SECRET still being set —
// only the one-time authorization step that creates or replaces a
// grant needs them.
export interface StoredGoogleGrant {
  name: string
  purpose: GooglePurpose
  clientId: string
  // Google's own "Desktop app" OAuth client type is a public client —
  // its downloaded JSON may carry no client_secret at all, or an empty
  // one Google doesn't actually require for the token exchange. Kept
  // optional rather than assumed, matching the real downloaded shape
  // rather than the "Web application" client type (which always has
  // one).
  clientSecret?: string
  tokens: OAuthTokens
  // Optional lifecycle metadata beyond the grant itself. A plain,
  // single-operator CLI-authorized install never sets these — both
  // default to unset and nothing in this package reads them. They
  // exist for a caller that provisions Google credentials on someone
  // else's behalf and needs to tell "this exact authorization" apart
  // from "a replacement of it" across restarts: `generation` is meant
  // to change only when such a caller intentionally issues a new
  // authorization, never on an ordinary token refresh, and `status`
  // can be set to 'invalid' once a generation is confirmed dead by the
  // provider — tombstoning it in place rather than deleting the grant,
  // so that same generation, seen again later, is recognizable as
  // already-dead rather than being silently reinstated.
  generation?: number
  status?: 'active' | 'invalid'
}

type StoreFile = Record<string, Partial<Record<GooglePurpose, StoredGoogleGrant>>>

const DEFAULT_PATH = path.join(os.homedir(), '.conduits', 'credentials.json')

// CONDUITS_CREDENTIAL_STORE_PATH overrides the default — kept out of
// the project directory by default (not next to conduits.yaml) so an
// operator committing their config directory to source control doesn't
// accidentally commit live OAuth tokens alongside it.
export function credentialStorePath(): string {
  return process.env.CONDUITS_CREDENTIAL_STORE_PATH ?? DEFAULT_PATH
}

// JSON has no Date type — expiresAt round-trips through
// JSON.stringify/parse as a plain ISO string, so reading a stored
// connection back needs this same step reconstructing a real Date.
// Every grant for every purpose under every name needs this, so it's
// applied once here rather than at each call site.
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

// Removes one confirmed-dead grant outright — the rest of the store
// (other names, or this same name's other purpose) is untouched. Only
// ever the right call for a grant nothing else is tracking generations
// for (a one-shot CLI-authorized credential, or an explicit user
// disconnect) — see markGoogleGrantInvalid below for the alternative a
// generation-tracking caller should use instead.
export function deleteGoogleGrant(storePath: string, name: string, purpose: GooglePurpose): void {
  const store = readStore(storePath)
  const forName = store[name]
  if (!forName || !forName[purpose]) return
  delete forName[purpose]
  if (Object.keys(forName).length === 0) delete store[name]
  writeJsonFileAtomic(storePath, store)
}

// The generation-preserving alternative to deleteGoogleGrant: a
// confirmed-dead grant is tombstoned in place (status: 'invalid'),
// keeping its generation and the rest of its material — see
// StoredGoogleGrant's own doc on why deleting it here would lose
// information a generation-tracking caller still needs. A no-op if
// nothing is stored under this name/purpose.
export function markGoogleGrantInvalid(storePath: string, name: string, purpose: GooglePurpose): void {
  const store = readStore(storePath)
  const grant = store[name]?.[purpose]
  if (!grant) return
  store[name] = { ...store[name], [purpose]: { ...grant, status: 'invalid' } }
  writeJsonFileAtomic(storePath, store)
}
