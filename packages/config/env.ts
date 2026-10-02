const ENV_REF_PATTERN = /^env:(.+)$/

// Secret references are "env:VAR_NAME"; compile.ts rejects any other
// form (source.credential, bearerToken.value).
export function parseEnvRef(raw: string): string {
  const match = ENV_REF_PATTERN.exec(raw)
  if (!match) throw new Error(`expected "env:VAR_NAME", got ${JSON.stringify(raw)}`)
  return match[1]!
}

// The value of an "env:VAR_NAME" reference; throws if unset. compile.ts
// calls it to check a reference at load time without keeping the value
// (see ConduitConfig.credentialRef), and to hash bearer tokens. A
// GatewayRuntime's getCredential() calls it per request.
export function resolveEnvRef(raw: string): string {
  const name = parseEnvRef(raw)
  const value = process.env[name]
  if (!value) throw new Error(`environment variable ${name} is not set`)
  return value
}
