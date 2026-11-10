// What the runtime gives the process, such as Node's process.env. Only a
// composition root reads it, and passes it to the readers here.
export type PlatformEnvironment = Record<string, string | undefined>

// The value of a secret reference, "env:VAR_NAME", in `platform`; throws
// if it has another form or the variable is unset. compile.ts calls it
// to check a reference at load time without keeping the value (see
// ConduitConfig.credentialRef), and to hash bearer tokens. A
// GatewayRuntime's getCredential() calls it per request.
export function resolveEnvRef(platform: PlatformEnvironment, raw: string): string {
  const name = /^env:(.+)$/.exec(raw)?.[1]
  if (!name) throw new Error(`expected "env:VAR_NAME", got ${JSON.stringify(raw)}`)
  const value = platform[name]
  if (!value) throw new Error(`environment variable ${name} is not set`)
  return value
}

// A required setting that must be a positive whole number. Throws,
// naming the variable, when it is missing or isn't one.
export function positiveIntegerFromEnv(platform: PlatformEnvironment, name: string): number {
  const raw = platform[name]
  if (!raw) throw new Error(`${name} is required`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive whole number, not "${raw}"`)
  return value
}
