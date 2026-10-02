import { readJsonFileOrDefault, writeJsonFileAtomic } from './atomic-file.ts'

// Fastmail API tokens are pasted once and never refreshed, so this has
// none of the Google store's refresh handling. It has the same
// generation and status fields as a Google grant so a caller can treat
// both alike, though a replaced token usually gets a new credentialRef.
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

// Marks the credential invalid in place, as markGoogleGrantInvalid does.
export function markFastmailCredentialInvalid(storePath: string, credentialRef: string): void {
  const store = readJsonFileOrDefault<StoreFile>(storePath, {})
  const existing = store[credentialRef]
  if (!existing) return
  store[credentialRef] = { ...existing, status: 'invalid' }
  writeJsonFileAtomic(storePath, store)
}

// Removes a credential the caller no longer references. Not for provider
// failures.
export function deleteFastmailCredential(storePath: string, credentialRef: string): void {
  const store = readJsonFileOrDefault<StoreFile>(storePath, {})
  if (!(credentialRef in store)) return
  delete store[credentialRef]
  writeJsonFileAtomic(storePath, store)
}
