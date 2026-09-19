import type { GooglePurpose } from '@conduits/config'

import { loadGoogleGrant, saveGoogleGrant, deleteGoogleGrant, markGoogleGrantInvalid, type StoredGoogleGrant } from './google-credential-store.ts'
import {
  loadFastmailCredential,
  saveFastmailCredential,
  deleteFastmailCredential,
  markFastmailCredentialInvalid,
  type StoredFastmailCredential,
} from './fastmail-credential-store.ts'

// The one persistence interface both Gateway wrappers genuinely share
// today (public self-hosted, private managed). Every method is async
// even though createFileCredentialStore's own implementation below is
// synchronous fs access underneath: a future
// KV-backed implementation (a self-hosted Gateway on Cloudflare
// Workers, say) can conform to this exact interface with no call-site
// changes anywhere that depends on it. Note there's no `storePath`
// parameter anywhere here — that's a filesystem-specific concept the
// interface itself must not know about; see createFileCredentialStore.
export interface CredentialStore {
  loadGoogleGrant(name: string, purpose: GooglePurpose): Promise<StoredGoogleGrant | null>
  saveGoogleGrant(grant: StoredGoogleGrant): Promise<void>
  deleteGoogleGrant(name: string, purpose: GooglePurpose): Promise<void>
  markGoogleGrantInvalid(name: string, purpose: GooglePurpose): Promise<void>
  loadFastmailCredential(credentialRef: string): Promise<StoredFastmailCredential | null>
  saveFastmailCredential(credential: StoredFastmailCredential): Promise<void>
  deleteFastmailCredential(credentialRef: string): Promise<void>
  markFastmailCredentialInvalid(credentialRef: string): Promise<void>
}

export interface FileCredentialStorePaths {
  googleStorePath: string
  fastmailStorePath: string
}

// The only implementation today — thin async wrappers around this
// package's existing flat-file functions, bound once to a specific
// pair of paths. Purely additive: every existing direct caller of
// loadGoogleGrant/saveFastmailCredential/etc. (getFreshGoogleAccessToken,
// both services/gateway's own sync/runtime code) keeps calling them
// exactly as before — this is a new, optional way to reach the same
// storage, not a replacement of the existing one.
export function createFileCredentialStore(paths: FileCredentialStorePaths): CredentialStore {
  return {
    async loadGoogleGrant(name, purpose) {
      return loadGoogleGrant(paths.googleStorePath, name, purpose)
    },
    async saveGoogleGrant(grant) {
      saveGoogleGrant(paths.googleStorePath, grant)
    },
    async deleteGoogleGrant(name, purpose) {
      deleteGoogleGrant(paths.googleStorePath, name, purpose)
    },
    async markGoogleGrantInvalid(name, purpose) {
      markGoogleGrantInvalid(paths.googleStorePath, name, purpose)
    },
    async loadFastmailCredential(credentialRef) {
      return loadFastmailCredential(paths.fastmailStorePath, credentialRef)
    },
    async saveFastmailCredential(credential) {
      saveFastmailCredential(paths.fastmailStorePath, credential)
    },
    async deleteFastmailCredential(credentialRef) {
      deleteFastmailCredential(paths.fastmailStorePath, credentialRef)
    },
    async markFastmailCredentialInvalid(credentialRef) {
      markFastmailCredentialInvalid(paths.fastmailStorePath, credentialRef)
    },
  }
}
