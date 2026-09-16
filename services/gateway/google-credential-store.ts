import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import type { OAuthTokens } from 'remix/auth'
import type { GooglePurpose } from '@conduits/config'

// A grant is self-contained on purpose (see this file's own callers):
// clientId/clientSecret travel with the grant instead of being read
// from the environment every time the gateway starts, so a running
// gateway service never depends on GOOGLE_CLIENT_ID/SECRET still
// being set — only `conduits auth google` (which creates or replaces a
// grant) needs them, once, at authorization time.
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
  let parsed: StoreFile
  try {
    parsed = JSON.parse(fs.readFileSync(storePath, 'utf8')) as StoreFile
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }

  const revived: StoreFile = {}
  for (const [name, byPurpose] of Object.entries(parsed)) {
    revived[name] = {}
    for (const [purpose, grant] of Object.entries(byPurpose ?? {})) {
      revived[name]![purpose as GooglePurpose] = reviveGrant(grant)
    }
  }
  return revived
}

// Best-effort permission tightening — some filesystems (notably on
// Windows) don't support POSIX mode bits the same way; a failure here
// must never block the actual write, only the permission hardening.
function chmodBestEffort(target: string, mode: number): void {
  try {
    fs.chmodSync(target, mode)
  } catch {
    // Not supported on this filesystem — see doc above.
  }
}

// Atomic: write to a temp file in the same directory (so the rename
// below is on the same filesystem, hence atomic), lock down its
// permissions, then rename over the real path. A crash or concurrent
// read mid-write can never observe a partially-written credentials.json
// — either the old complete file or the new complete file, never
// neither/a fragment.
function writeStoreAtomic(storePath: string, store: StoreFile): void {
  const dir = path.dirname(storePath)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodBestEffort(dir, 0o700)

  const tmpPath = path.join(dir, `.credentials.${process.pid}.${Date.now()}.tmp`)
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), { mode: 0o600 })
  chmodBestEffort(tmpPath, 0o600)
  fs.renameSync(tmpPath, storePath)
}

export function loadGoogleGrant(storePath: string, name: string, purpose: GooglePurpose): StoredGoogleGrant | null {
  return readStore(storePath)[name]?.[purpose] ?? null
}

export function saveGoogleGrant(storePath: string, grant: StoredGoogleGrant): void {
  const store = readStore(storePath)
  store[grant.name] = { ...store[grant.name], [grant.purpose]: grant }
  writeStoreAtomic(storePath, store)
}

// Removes one confirmed-dead grant — the rest of the store (other
// names, or this same name's other purpose) is untouched.
export function deleteGoogleGrant(storePath: string, name: string, purpose: GooglePurpose): void {
  const store = readStore(storePath)
  const forName = store[name]
  if (!forName || !forName[purpose]) return
  delete forName[purpose]
  if (Object.keys(forName).length === 0) delete store[name]
  writeStoreAtomic(storePath, store)
}
