import type { GooglePurpose } from '@conduits/config'

import { loadGoogleGrant, saveGoogleGrant, deleteGoogleGrant, markGoogleGrantInvalid, type StoredGoogleGrant } from './google-credential-store.ts'
import {
  loadFastmailCredential,
  saveFastmailCredential,
  deleteFastmailCredential,
  markFastmailCredentialInvalid,
  type StoredFastmailCredential,
} from './fastmail-credential-store.ts'

// Credential storage for a Gateway runtime. Async, though the file
// implementation is synchronous, so another store (e.g. a key-value
// store for a Gateway on Cloudflare Workers) can implement it. No
// `storePath`: that belongs to the file implementation.
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

// The file implementation: async wrappers over this package's file
// functions, bound to a pair of paths. Those functions can still be
// called directly.
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
