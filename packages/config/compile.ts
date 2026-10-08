import { parse as parseYaml } from 'yaml'
import { hashBearerToken, normalizeHost, normalizeRoutePath, type RouteBinding } from '@conduits/gateway'
import { fieldDefinitionProblems, type FieldSchema, type FieldSchemas } from '@conduits/conduit'
import type { AllowlistEntry, ConduitConfig, HiddenFormFieldRule, ApiKeyRef } from '@conduits/gateway'

import type { RawAllowlistEntry, RawConduitsFile, RawHiddenField, RawRouteEntry } from './types.ts'
import { resolveEnvRef } from './env.ts'
import type { SourceCompileResult } from './source-compiler.ts'
import { compileFastmailSource } from './sources/fastmail.ts'
import { compileGoogleSheetsSource } from './sources/google-sheets.ts'
import { compileGmailSource } from './sources/gmail.ts'

type SourceCompiler = (raw: unknown, context: string) => SourceCompileResult

// The YAML compiler for each source type, with its file in sources/. A
// source can be listed here while a given runtime can't operate it yet
// (see supportedSourceTypes).
const sourceCompilers: Record<string, SourceCompiler> = {
  fastmail: compileFastmailSource,
  googleSheets: compileGoogleSheetsSource,
  gmail: compileGmailSource,
}

// A curi is one segment; route paths, which may contain '/', are
// validated by normalizeRoutePath in @conduits/gateway.
const CURI_PATTERN = /^[a-zA-Z0-9_-]+$/

export interface CompileOptions {
  // The suriTypes this runtime can operate. A conduit with any other
  // type fails the whole load rather than its first request.
  supportedSourceTypes: readonly string[]
}

export interface CompiledConduits {
  configs: ConduitConfig[]
  bindings: RouteBinding[]
}

// Parses and validates a conduits.yaml into a ConduitConfig and its
// RouteBindings per entry. Throws on the first problem, so a bad config
// fails before serving traffic.
//
// The YAML key (`contact-form` below) is a label for error messages,
// not the curi. Each conduit names its curi explicitly:
//
//   conduits:
//     contact-form:
//       curi: contact
//       ...
//
// See docs/data-model.md "Vocabulary".
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

  const allowlist = compileAllowlist(entry.allowlist, context)
  const { tokenRequiredMethods, apiKeys } = compileBearerToken(entry.bearerToken, racm, context)
  const hiddenFormField = compileHiddenFields(entry.hiddenFields, context)
  const fields = compileFields(entry.fields, context)
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
      tokenRequiredMethods,
      apiKeys,
      suriType,
      suriObjectKey,
      suriConfig,
      fields,
      hiddenFormField,
      credentialRef,
    },
    bindings,
  }
}

// Without `routes:`, the default route `/<curi>`. With it, the paths
// given, normalized and validated as the Gateway does.
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

    // `host` is omitted rather than set to undefined, so every host-less
    // binding has the same shape.
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

// YAML allows one bearer token per conduit; it becomes a one-element
// apiKeys array scoped to requiredFor.
function compileBearerToken(
  raw: unknown,
  racm: string[],
  context: string,
): { tokenRequiredMethods: string[]; apiKeys: ApiKeyRef[] } {
  if (raw === undefined) return { tokenRequiredMethods: [], apiKeys: [] }
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

  // Hashed here; the plaintext never reaches ConduitConfig.
  const plaintext = resolveEnvRef(value)
  return {
    tokenRequiredMethods: requiredFor as string[],
    apiKeys: [{ tokenHash: hashBearerToken(plaintext), scopes: requiredFor as string[] }],
  }
}

// `fields:` maps a field name to its type (`email: email`) or to
// {type, options} (a choice field); the gateway checks every write and
// types every read by them.
function compileFields(raw: unknown, context: string): FieldSchemas {
  if (raw === undefined) return {}
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(`${context}: fields must be a map of field name to a type or {type, options}`)
  const fields: FieldSchemas = {}
  for (const [field, value] of Object.entries(raw)) {
    const definition = typeof value === 'string' ? { type: value } : value
    if (typeof definition !== 'object' || definition === null) throw new Error(`${context}: fields.${field} must be a type or {type, options}`)
    const { type, options, ...rest } = definition as Record<string, unknown>
    const extra = Object.keys(rest)
    if (extra.length > 0) throw new Error(`${context}: fields.${field} has unknown key '${extra[0]}'`)
    const problems = fieldDefinitionProblems({ type, options })
    if (problems.length > 0) throw new Error(`${context}: fields.${field} ${problems[0]}`)
    fields[field] = (options === undefined ? { type } : { type, options }) as FieldSchema
  }
  return fields
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
