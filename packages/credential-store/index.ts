export { writeJsonFileAtomic, readJsonFileOrDefault } from './atomic-file.ts'

export {
  credentialStorePath,
  loadGoogleGrant,
  saveGoogleGrant,
  deleteGoogleGrant,
  markGoogleGrantInvalid,
} from './google-credential-store.ts'
export type { StoredGoogleGrant } from './google-credential-store.ts'

export { getFreshGoogleAccessToken } from './google-token.ts'
export type { GoogleTokenResult, GoogleTokenOptions } from './google-token.ts'

export {
  loadFastmailCredential,
  saveFastmailCredential,
  markFastmailCredentialInvalid,
  deleteFastmailCredential,
} from './fastmail-credential-store.ts'
export type { StoredFastmailCredential } from './fastmail-credential-store.ts'
