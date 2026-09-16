const GOOGLE_REF_PATTERN = /^google:(.+)$/

// The only scheme googleSheets/gmail source.credential is allowed to
// use in YAML — "google:<name>", naming an entry in a runtime's own
// local credential store (see
// services/gateway/google-credential-store.ts). Deliberately
// format-only validation: unlike env.ts's resolveEnvRef, this package
// never checks whether <name> actually exists anywhere — that would
// require knowing about a specific runtime's local filesystem store,
// which is app-specific state this package has no business touching.
export function parseGoogleRef(raw: string): string {
  const match = GOOGLE_REF_PATTERN.exec(raw)
  if (!match) throw new Error(`expected "google:<name>", got ${JSON.stringify(raw)}`)
  return match[1]!
}
