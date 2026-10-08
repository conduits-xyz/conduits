import type { GoogleSheetsClientOptions } from '@conduits/conduit'
import type { GatewayDeps, ThrottleLimits } from '@conduits/gateway'

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
// CONDUITS_SHEETS_REQUESTS_PER_MINUTE_PER_ACCOUNT, all required. The
// composition root adds the endpoint, fetch and clock.
export function googleSheetsOptionsFromEnv(): Pick<GoogleSheetsClientOptions, 'readCacheMs' | 'budget'> {
  return {
    readCacheMs: positiveIntegerFromEnv('CONDUITS_SHEETS_READ_CACHE_MS'),
    budget: {
      perMinute: positiveIntegerFromEnv('CONDUITS_SHEETS_REQUESTS_PER_MINUTE'),
      perCredentialPerMinute: positiveIntegerFromEnv('CONDUITS_SHEETS_REQUESTS_PER_MINUTE_PER_ACCOUNT'),
    },
  }
}

// The addresses of servers trusted to forward their visitors' addresses
// (GatewayDeps.trustedForwarders), from CONDUITS_TRUSTED_FORWARDERS: a
// comma-separated list, empty when unset.
export function trustedForwardersFromEnv(): string[] {
  return (process.env.CONDUITS_TRUSTED_FORWARDERS ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
}

// The throttle's limits on each client address (ThrottleLimits), from
// CONDUITS_THROTTLE_REQUESTS, CONDUITS_THROTTLE_WINDOW_MS,
// CONDUITS_THROTTLE_BAN_AFTER and CONDUITS_THROTTLE_BAN_MS, all
// required. Throws when the ban threshold isn't above the request limit.
export function throttleLimitsFromEnv(): ThrottleLimits {
  const limits = {
    requests: positiveIntegerFromEnv('CONDUITS_THROTTLE_REQUESTS'),
    windowMs: positiveIntegerFromEnv('CONDUITS_THROTTLE_WINDOW_MS'),
    banAfter: positiveIntegerFromEnv('CONDUITS_THROTTLE_BAN_AFTER'),
    banMs: positiveIntegerFromEnv('CONDUITS_THROTTLE_BAN_MS'),
  }
  if (limits.banAfter <= limits.requests) throw new Error('CONDUITS_THROTTLE_BAN_AFTER must be greater than CONDUITS_THROTTLE_REQUESTS')
  return limits
}
