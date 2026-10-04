import type { GatewayDeps } from '@conduits/gateway'
import type { GoogleSheetsClientOptions } from '@conduits/conduit'

// Tunable values from the environment; each is required and must be a
// positive whole number (`.env.example` lists them).
function requiredPositiveInteger(name: string): number {
  const raw = process.env[name]
  if (!raw) throw new Error(`${name} is required (see .env.example)`)
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive whole number, not "${raw}"`)
  return value
}

export function loadListLimits(): GatewayDeps['listLimits'] {
  return {
    default: requiredPositiveInteger('CONDUITS_LIST_DEFAULT_LIMIT'),
    max: requiredPositiveInteger('CONDUITS_LIST_MAX_LIMIT'),
  }
}

export function loadSheetsOptions(): GoogleSheetsClientOptions {
  return {
    readCacheMs: requiredPositiveInteger('CONDUITS_SHEETS_READ_CACHE_MS'),
    budget: {
      perMinute: requiredPositiveInteger('CONDUITS_SHEETS_REQUESTS_PER_MINUTE'),
      perCredentialPerMinute: requiredPositiveInteger('CONDUITS_SHEETS_REQUESTS_PER_MINUTE_PER_ACCOUNT'),
    },
  }
}
