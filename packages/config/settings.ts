import type { GoogleSheetsClientOptions } from '@conduits/conduit'
import type { GatewayDeps } from '@conduits/gateway'

import { positiveIntegerFromEnv } from './env.ts'

// A gateway's list-read page sizes (GatewayDeps.listLimits), from
// CONDUITS_LIST_DEFAULT_LIMIT and CONDUITS_LIST_MAX_LIMIT. Throws when
// either is missing or the default is above the maximum.
export function listLimitsFromEnv(): GatewayDeps['listLimits'] {
  const limits = {
    default: positiveIntegerFromEnv('CONDUITS_LIST_DEFAULT_LIMIT'),
    max: positiveIntegerFromEnv('CONDUITS_LIST_MAX_LIMIT'),
  }
  if (limits.default > limits.max) throw new Error('CONDUITS_LIST_DEFAULT_LIMIT must not exceed CONDUITS_LIST_MAX_LIMIT')
  return limits
}

// The Google Sheets client's read cache and request budget
// (createGoogleSheetsClient), from CONDUITS_SHEETS_READ_CACHE_MS,
// CONDUITS_SHEETS_REQUESTS_PER_MINUTE and
// CONDUITS_SHEETS_REQUESTS_PER_MINUTE_PER_ACCOUNT, all required.
export function googleSheetsOptionsFromEnv(): GoogleSheetsClientOptions {
  return {
    readCacheMs: positiveIntegerFromEnv('CONDUITS_SHEETS_READ_CACHE_MS'),
    budget: {
      perMinute: positiveIntegerFromEnv('CONDUITS_SHEETS_REQUESTS_PER_MINUTE'),
      perCredentialPerMinute: positiveIntegerFromEnv('CONDUITS_SHEETS_REQUESTS_PER_MINUTE_PER_ACCOUNT'),
    },
  }
}
