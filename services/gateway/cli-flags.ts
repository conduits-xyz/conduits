import type { GooglePurpose } from '@conduits/config'

// knownFlags is required, so a misspelt flag is reported as
// unrecognized rather than ignored.
export function parseFlags(args: string[], knownFlags: readonly string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (!arg.startsWith('--')) continue

    // Both `--key value` and `--key=value`.
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
