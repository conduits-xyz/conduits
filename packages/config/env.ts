const ENV_REF_PATTERN = /^env:(.+)$/

// The only credential/secret-reference scheme this schema supports for
// now: "env:VAR_NAME". Anything else is a compile-time error — see
// compile.ts's own validation of every place this scheme is used
// (source.credential, bearerToken.value).
export function parseEnvRef(raw: string): string {
  const match = ENV_REF_PATTERN.exec(raw)
  if (!match) throw new Error(`expected "env:VAR_NAME", got ${JSON.stringify(raw)}`)
  return match[1]!
}

// Resolves an "env:VAR_NAME" reference to its live value, throwing if
// unset. Used two ways, deliberately at two different times:
//  - compile.ts calls this to VALIDATE a reference at load time
//    (fail-fast if the variable isn't set) without ever keeping the
//    resolved value — see ConduitConfig.credentialRef's own contract.
//  - a GatewayRuntime's own getCredential()/bearer-token
//    handling calls this to actually fetch the live value, either at
//    request time (credentials) or once at compile time before hashing
//    (bearer tokens) — the one place this convention is interpreted on
//    either side.
export function resolveEnvRef(raw: string): string {
  const name = parseEnvRef(raw)
  const value = process.env[name]
  if (!value) throw new Error(`environment variable ${name} is not set`)
  return value
}
