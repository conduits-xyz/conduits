import type { GooglePurpose } from '@conduits/config'

export function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
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
