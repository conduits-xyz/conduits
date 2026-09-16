import type { GooglePurpose } from '@conduits/config'

// knownFlags is required, not optional: every call site must declare
// its own valid flag set, so a typo'd flag name (--puspose) gets a
// real "unrecognized flag" error instead of being silently parsed and
// ignored, only to surface later as a confusing "you didn't pass
// --purpose" message with no hint why.
export function parseFlags(args: string[], knownFlags: readonly string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (!arg.startsWith('--')) continue

    // Accept both `--key value` and `--key=value` — the first is what
    // this parser originally supported; the second is common enough
    // (many CLIs accept both) that failing to recognize it produced a
    // genuinely misleading error (`--purpose=sheets requires a value`,
    // as if no value had been given at all).
    const eqIndex = arg.indexOf('=')
    const key = eqIndex === -1 ? arg.slice(2) : arg.slice(2, eqIndex)

    if (!knownFlags.includes(key)) {
      throw new Error(`unrecognized flag '--${key}' — expected one of: ${knownFlags.map((f) => `--${f}`).join(', ')}`)
    }

    if (eqIndex !== -1) {
      flags[key] = arg.slice(eqIndex + 1)
      continue
    }

    const value = args[i + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`--${key} requires a value`)
    }
    flags[key] = value
    i++
  }
  return flags
}

export function isGooglePurpose(value: string | undefined): value is GooglePurpose {
  return value === 'sheets' || value === 'gmail'
}
