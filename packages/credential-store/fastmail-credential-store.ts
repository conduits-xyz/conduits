import { readJsonFileOrDefault, writeJsonFileAtomic } from './atomic-file.ts'

// Fastmail's own static API token has no refresh/revocation dance —
// it's a single opaque string a user pastes in once, with no OAuth
// concept of expiry or rotation to model — so this store carries none
// of Google's refresh-token machinery. It still carries the same
// generation/status lifecycle as a Google grant (see
// google-credential-store.ts's StoredGoogleGrant) so a caller
// provisioning credentials on someone else's behalf can treat both
// kinds uniformly, even though a replacement Fastmail token is more
// naturally modeled as a brand-new `credentialRef` than an in-place
// update — `generation` here mainly exists for descriptor-shape
// consistency, not because Fastmail itself ever bumps it in place.
export interface StoredFastmailCredential {
  credentialRef: string
  apiToken: string
  generation: number
  status: 'active' | 'invalid'
}

type StoreFile = Record<string, StoredFastmailCredential>

export function loadFastmailCredential(storePath: string, credentialRef: string): StoredFastmailCredential | null {
  return readJsonFileOrDefault<StoreFile>(storePath, {})[credentialRef] ?? null
}

export function saveFastmailCredential(storePath: string, credential: StoredFastmailCredential): void {
  const store = readJsonFileOrDefault<StoreFile>(storePath, {})
  store[credential.credentialRef] = credential
  writeJsonFileAtomic(storePath, store)
}

// Same reasoning as google-credential-store.ts's markGoogleGrantInvalid:
// tombstone in place, never delete, so a stale snapshot naming this
// same generation can be recognized as already-dead.
export function markFastmailCredentialInvalid(storePath: string, credentialRef: string): void {
  const store = readJsonFileOrDefault<StoreFile>(storePath, {})
  const existing = store[credentialRef]
  if (!existing) return
  store[credentialRef] = { ...existing, status: 'invalid' }
  writeJsonFileAtomic(storePath, store)
}

// Orphan cleanup only — a credentialRef a caller's own bookkeeping no
// longer references at all, never called in response to a live
// provider failure (Fastmail's token has nothing to confirm dead).
export function deleteFastmailCredential(storePath: string, credentialRef: string): void {
  const store = readJsonFileOrDefault<StoreFile>(storePath, {})
  if (!(credentialRef in store)) return
  delete store[credentialRef]
  writeJsonFileAtomic(storePath, store)
}
