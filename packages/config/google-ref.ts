const GOOGLE_REF_PATTERN = /^google:(.+)$/

// googleSheets and gmail credentials in YAML are "google:<name>",
// naming a grant in the runtime's credential store
// (packages/credential-store/google-credential-store.ts). Only the
// format is checked; whether the grant exists depends on the runtime's
// store, which this package doesn't read.
export function parseGoogleRef(raw: string): string {
  const match = GOOGLE_REF_PATTERN.exec(raw)
  if (!match) throw new Error(`expected "google:<name>", got ${JSON.stringify(raw)}`)
  return match[1]!
}
