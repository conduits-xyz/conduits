import { parse as parseYaml } from 'yaml'
import { hashBearerToken, normalizeHost, normalizeRoutePath, type RouteBinding } from '@conduits/gateway'
import type { AllowlistEntry, ConduitConfig, HiddenFormFieldRule } from '@conduits/gateway'

import type { RawAllowlistEntry, RawConduitsFile, RawHiddenField, RawRouteEntry } from './types.ts'
import { resolveEnvRef } from './env.ts'
import type { SourceCompileResult } from './source-compiler.ts'
import { compileFastmailSource } from './sources/fastmail.ts'
import { compileGoogleSheetsSource } from './sources/google-sheets.ts'
import { compileGmailSource } from './sources/gmail.ts'

type SourceCompiler = (raw: unknown, context: string) => SourceCompileResult

// Add an entry here (and a sibling sources/<name>.ts) as each new
// integration's human-facing YAML shape is designed. Same
// registration-point pattern packages/conduit's own sourceClients
// uses — this map is independent of a given runtime's
// supportedSourceTypes (see CompileOptions below): this package may
// know a source's YAML shape while a particular runtime still can't
// operate it.
const sourceCompilers: Record<string, SourceCompiler> = {
  fastmail: compileFastmailSource,
  googleSheets: compileGoogleSheetsSource,
  gmail: compileGmailSource,
}

// Deliberately independent of route-path syntax (which allows the same
// characters plus '/') — a curi is one opaque segment, self-hosted and
// unnamespaced. See @conduits/gateway's normalizeRoutePath for the
// (different, path-shaped) validation a routes: entry gets.
const CURI_PATTERN = /^[a-zA-Z0-9_-]+$/

export interface CompileOptions {
  // Which suriTypes THIS runtime can actually operate — checked per
  // conduit before any source-shape compiling happens, so a config
  // naming a source type this runtime can't run fails the whole load,
  // not the first live request. Independent of sourceCompilers above:
  // this package may know a source's YAML shape while a particular
  // runtime (e.g. this gateway, before it grows Google OAuth refresh
  // support for a given purpose) still can't operate it.
  supportedSourceTypes: readonly string[]
}

export interface CompiledConduits {
  configs: ConduitConfig[]
  bindings: RouteBinding[]
}

// Parses and validates a whole conduits.yaml, returning one
// ConduitConfig plus its RouteBinding(s) per entry, or throwing on the
// first problem found — deliberately whole-file, fail-fast: an
// operator needs to know their config is wrong before it's serving
// traffic, not discover it as an intermittent, hard-to-place failure
// later.
//
// The YAML map key (`contact-form` below) is only ever a local
// configuration label, used in error messages — it is never the curi.
// Every conduit must name its own public curi explicitly:
//
//   conduits:
//     contact-form:
//       curi: contact
//       ...
//
// See docs/data-model.md's "Vocabulary" (curi vs. YAML label) and
// @conduits/gateway's RouteBinding.
export function compileConduits(yamlText: string, options: CompileOptions): CompiledConduits {
  const doc = parseYaml(yamlText, { uniqueKeys: true }) as unknown

  if (typeof doc !== 'object' || doc === null || typeof (doc as RawConduitsFile).conduits !== 'object' || (doc as RawConduitsFile).conduits === null) {
    throw new Error('conduits.yaml must have a top-level "conduits" map')
  }

  const conduits = (doc as RawConduitsFile).conduits as Record<string, unknown>
  const compiled = Object.entries(conduits).map(([label, entry]) => compileConduitEntry(label, entry, options))

  const configs = compiled.map((entry) => entry.config)
  const bindings = compiled.flatMap((entry) => entry.bindings)

  checkDuplicateCuris(configs)
  checkDuplicateBindings(bindings)

  return { configs, bindings }
}

function checkDuplicateCuris(configs: ConduitConfig[]): void {
  const seen = new Set<string>()
  for (const config of configs) {
    if (seen.has(config.curi)) throw new Error(`duplicate curi '${config.curi}' — a curi silently overwriting another conduit's is not allowed`)
    seen.add(config.curi)
  }
}

function checkDuplicateBindings(bindings: RouteBinding[]): void {
  const seen = new Set<string>()
  for (const binding of bindings) {
    const key = `${normalizeHost(binding.host) ?? ''}${binding.path}`
    if (seen.has(key)) {
      throw new Error(`duplicate route ${binding.host ? `${binding.host}${binding.path}` : binding.path} — two conduits cannot serve the same (host, path)`)
    }
    seen.add(key)
  }
}

function compileConduitEntry(label: string, rawEntry: unknown, options: CompileOptions): { config: ConduitConfig; bindings: RouteBinding[] } {
  const context = `conduit '${label}'`

  if (typeof rawEntry !== 'object' || rawEntry === null) {
    throw new Error(`${context}: must be a map`)
  }
  const entry = rawEntry as Record<string, unknown>

  if (typeof entry.curi !== 'string' || entry.curi === '') {
    throw new Error(`${context}: curi is required`)
  }
  if (!CURI_PATTERN.test(entry.curi)) {
    throw new Error(`${context}: curi must contain only letters, digits, '-', and '_'`)
  }
  const curi = entry.curi

  if (!Array.isArray(entry.methods) || entry.methods.length === 0 || !entry.methods.every((m) => typeof m === 'string')) {
    throw new Error(`${context}: methods is required and must be a non-empty list of strings`)
  }
  const racm = entry.methods as string[]

  if (entry.throttle !== undefined && typeof entry.throttle !== 'boolean') {
    throw new Error(`${context}: throttle must be a boolean`)
  }
  const throttle = (entry.throttle as boolean | undefined) ?? true

  const allowlist = compileAllowlist(entry.allowlist, context)
  const { tokenRequiredMethods, bearerTokenHash } = compileBearerToken(entry.bearerToken, racm, context)
  const hiddenFormField = compileHiddenFields(entry.hiddenFields, context)
  const bindings = compileRoutes(entry.routes, curi, context)

  if (typeof entry.source !== 'object' || entry.source === null || typeof (entry.source as Record<string, unknown>).type !== 'string') {
    throw new Error(`${context}: source.type is required`)
  }
  const suriType = (entry.source as Record<string, unknown>).type as string
  if (!options.supportedSourceTypes.includes(suriType)) {
    throw new Error(`${context}: source type '${suriType}' is not supported by this gateway`)
  }
  const compileSource = sourceCompilers[suriType]
  if (!compileSource) {
    throw new Error(`${context}: no YAML schema compiler registered for source type '${suriType}'`)
  }
  const { suriObjectKey, suriConfig, credentialRef } = compileSource(entry.source, context)

  return {
    config: {
      curi,
      allowlist,
      racm,
      throttle,
      tokenRequiredMethods,
      bearerTokenHash,
      suriType,
      suriObjectKey,
      suriConfig,
      hiddenFormField,
      credentialRef,
    },
    bindings,
  }
}

// No `routes:` at all -> the default self-hosted route, `/<curi>` (see
// docs/data-model.md and README.md's "self-hosted default route").
// `routes:` present -> exactly what the operator wrote, each path
// normalized/validated the same way the Gateway itself would.
function compileRoutes(raw: unknown, curi: string, context: string): RouteBinding[] {
  if (raw === undefined) return [{ path: normalizeRoutePath(`/${curi}`), curi }]

  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${context}: routes must be a non-empty list when present`)
  }

  return (raw as RawRouteEntry[]).map((route, index) => {
    if (typeof route !== 'object' || route === null || typeof route.path !== 'string') {
      throw new Error(`${context}: routes[${index}].path is required and must be a string`)
    }
    if (route.host !== undefined && typeof route.host !== 'string') {
      throw new Error(`${context}: routes[${index}].host must be a string`)
    }

    let path: string
    try {
      path = normalizeRoutePath(route.path)
    } catch (err) {
      throw new Error(`${context}: routes[${index}] ${err instanceof Error ? err.message : String(err)}`)
    }

    // Omit `host` entirely rather than setting it to `undefined` —
    // keeps every host-less binding shaped identically whether it came
    // from an explicit `routes:` entry or the default-route branch
    // above.
    return route.host === undefined ? { path, curi } : { host: route.host, path, curi }
  })
}

function compileAllowlist(raw: unknown, context: string): AllowlistEntry[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new Error(`${context}: allowlist must be a list`)

  return (raw as RawAllowlistEntry[]).map((item, index) => {
    if (typeof item === 'string') return { ip: item, status: 'active' as const }
    if (typeof item === 'object' && item !== null && typeof item.ip === 'string') {
      const comment = typeof item.comment === 'string' ? item.comment : undefined
      return { ip: item.ip, comment, status: 'active' as const }
    }
    throw new Error(`${context}: allowlist[${index}] must be an IP string or {ip, comment}`)
  })
}

function compileBearerToken(
  raw: unknown,
  racm: string[],
  context: string,
): { tokenRequiredMethods: string[]; bearerTokenHash: string | null } {
  if (raw === undefined) return { tokenRequiredMethods: [], bearerTokenHash: null }
  if (typeof raw !== 'object' || raw === null) throw new Error(`${context}: bearerToken must be a map`)

  const { value, requiredFor } = raw as { value?: unknown; requiredFor?: unknown }
  if (typeof value !== 'string') throw new Error(`${context}: bearerToken.value is required`)
  if (!Array.isArray(requiredFor) || requiredFor.length === 0 || !requiredFor.every((m) => typeof m === 'string')) {
    throw new Error(
      `${context}: bearerToken.requiredFor must be a non-empty list of strings — omit bearerToken entirely if no method needs one`,
    )
  }

  const notInMethods = (requiredFor as string[]).filter((method) => !racm.includes(method))
  if (notInMethods.length > 0) {
    throw new Error(
      `${context}: bearerToken.requiredFor lists ${JSON.stringify(notInMethods)}, not present in methods ${JSON.stringify(racm)} — a method must be allowed before a token can be required for it`,
    )
  }

  // Resolved and hashed immediately — only the hash reaches
  // ConduitConfig. See bearerTokenHash's own doc in
  // packages/gateway/types.ts: never the plaintext.
  const plaintext = resolveEnvRef(value)
  return { tokenRequiredMethods: requiredFor as string[], bearerTokenHash: hashBearerToken(plaintext) }
}

function compileHiddenFields(raw: unknown, context: string): HiddenFormFieldRule[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) throw new Error(`${context}: hiddenFields must be a list`)

  return (raw as RawHiddenField[]).map((field) => compileHiddenField(field, context))
}

function compileHiddenField(field: RawHiddenField, context: string): HiddenFormFieldRule {
  if (typeof field !== 'object' || field === null || typeof field.name !== 'string' || field.name === '') {
    throw new Error(`${context}: a hiddenFields entry is missing its name`)
  }
  const name = field.name

  if (field.policy === 'honeypot') {
    return { fieldName: name, policy: 'drop-if-filled' }
  }
  if (field.policy === 'mustEqual') {
    if (typeof field.value !== 'string') {
      throw new Error(`${context}: hiddenFields.${name}: policy 'mustEqual' requires value`)
    }
    if (field.forward !== undefined && typeof field.forward !== 'boolean') {
      throw new Error(`${context}: hiddenFields.${name}: forward must be a boolean`)
    }
    return { fieldName: name, policy: 'pass-if-match', value: field.value, include: (field.forward as boolean | undefined) ?? false }
  }
  throw new Error(`${context}: hiddenFields.${name}: unknown policy '${String(field.policy)}'`)
}
