import type { GooglePurpose } from '@conduits/config'

// The commands a person runs, as package.json names them, and the
// messages that tell them which one to run.

const authGoogleCommand = (purpose: GooglePurpose, name: string) => `npm run auth:google -- --purpose ${purpose} --name ${name}`

export const USAGE = [
  'npm run auth:google -- --purpose <sheets|gmail> --name <name>',
  'npm run sheets:create -- --name <name> [--title <title>]',
  'npm run fastmail:identities -- --credential env:<NAME>',
  'npm run gateway',
]

// A Google grant that isn't in the credential store.
export const noGrantMessage = (name: string, purpose: GooglePurpose) =>
  `no Google credential named '${name}' for purpose '${purpose}' — run: ${authGoogleCommand(purpose, name)}`

// A Google grant removed from the credential store, and why.
export const grantRemovedMessage = (name: string, purpose: GooglePurpose, why: string) =>
  `Google credential '${name}' (${purpose}) ${why} and has been removed — run: ${authGoogleCommand(purpose, name)}`
