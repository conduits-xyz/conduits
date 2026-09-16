import { parse as parseYaml } from 'yaml'
import { hashBearerToken } from '@conduits/gateway'
import type { AllowlistEntry, ConduitConfig, HiddenFormFieldRule } from '@conduits/gateway'

import type { RawAllowlistEntry, RawConduitsFile, RawHiddenField } from './types.ts'
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

// Parses and validates a whole conduits.yaml, returning one
// ConduitConfig per entry or throwing on the first problem found —
// deliberately whole-file, fail-fast: an operator needs to
// know their config is wrong before it's serving traffic, not discover
// it as an intermittent, hard-to-place failure later.
export function compileConduits(yamlText: string, options: CompileOptions): ConduitConfig[] {
  // uniqueKeys is already yaml@2's own default, but callers of this
  // function should never depend on that continuing to be true rather
  // than an explicit choice here — a duplicate curi silently
  // overwriting an earlier entry is exactly the kind of access-control
  // mistake this schema exists to prevent.
  const doc = parseYaml(yamlText, { uniqueKeys: true }) as unknown

  if (typeof doc !== 'object' || doc === null || typeof (doc as RawConduitsFile).conduits !== 'object' || (doc as RawConduitsFile).conduits === null) {
    throw new Error('conduits.yaml must have a top-level "conduits" map')
  }

  const conduits = (doc as RawConduitsFile).conduits as Record<string, unknown>
  return Object.entries(conduits).map(([curi, entry]) => compileConduitEntry(curi, entry, options))
}

function compileConduitEntry(curi: string, rawEntry: unknown, options: CompileOptions): ConduitConfig {
  const context = `conduit '${curi}'`

  if (!CURI_PATTERN.test(curi)) {
    throw new Error(`${context}: curi must contain only letters, digits, '-', and '_'`)
  }
  if (typeof rawEntry !== 'object' || rawEntry === null) {
    throw new Error(`${context}: must be a map`)
  }
  const entry = rawEntry as Record<string, unknown>

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
  }
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
