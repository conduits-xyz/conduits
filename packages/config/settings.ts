import * as path from 'node:path'
import type { GoogleSheetsClientOptions } from '@conduits/conduit'
import type { GatewayDeps, ThrottleLimits } from '@conduits/gateway'

import { positiveIntegerFromEnv, type PlatformEnvironment } from './env.ts'

// A gateway's list-read page sizes (GatewayDeps.listLimits), from
// CONDUITS_LIST_DEFAULT_LIMIT and CONDUITS_LIST_MAX_LIMIT. Throws when
// either is missing or the default is above the maximum.
export function listLimitsFromEnv(platform: PlatformEnvironment): GatewayDeps['listLimits'] {
  const limits = {
    default: positiveIntegerFromEnv(platform, 'CONDUITS_LIST_DEFAULT_LIMIT'),
    max: positiveIntegerFromEnv(platform, 'CONDUITS_LIST_MAX_LIMIT'),
  }
  if (limits.default > limits.max) throw new Error('CONDUITS_LIST_DEFAULT_LIMIT must not exceed CONDUITS_LIST_MAX_LIMIT')
  return limits
}

// The Google Sheets client's read cache and request budget
// (createGoogleSheetsClient), from CONDUITS_SHEETS_READ_CACHE_MS,
// CONDUITS_SHEETS_REQUESTS_PER_MINUTE and
// CONDUITS_SHEETS_REQUESTS_PER_MINUTE_PER_ACCOUNT, all required. The
// composition root adds the endpoint, fetch and clock.
export function googleSheetsOptionsFromEnv(platform: PlatformEnvironment): Pick<GoogleSheetsClientOptions, 'readCacheMs' | 'budget'> {
  return {
    readCacheMs: positiveIntegerFromEnv(platform, 'CONDUITS_SHEETS_READ_CACHE_MS'),
    budget: {
      perMinute: positiveIntegerFromEnv(platform, 'CONDUITS_SHEETS_REQUESTS_PER_MINUTE'),
      perCredentialPerMinute: positiveIntegerFromEnv(platform, 'CONDUITS_SHEETS_REQUESTS_PER_MINUTE_PER_ACCOUNT'),
    },
  }
}

// The addresses of servers trusted to forward their visitors' addresses
// (GatewayDeps.trustedForwarders), from CONDUITS_TRUSTED_FORWARDERS: a
// comma-separated list, empty when unset.
export function trustedForwardersFromEnv(platform: PlatformEnvironment): string[] {
  return (platform.CONDUITS_TRUSTED_FORWARDERS ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
}

// The throttle's limits on each client address (ThrottleLimits), from
// CONDUITS_THROTTLE_REQUESTS, CONDUITS_THROTTLE_WINDOW_MS,
// CONDUITS_THROTTLE_BAN_AFTER and CONDUITS_THROTTLE_BAN_MS, all
// required. Throws when the ban threshold isn't above the request limit.
export function throttleLimitsFromEnv(platform: PlatformEnvironment): ThrottleLimits {
  const limits = {
    requests: positiveIntegerFromEnv(platform, 'CONDUITS_THROTTLE_REQUESTS'),
    windowMs: positiveIntegerFromEnv(platform, 'CONDUITS_THROTTLE_WINDOW_MS'),
    banAfter: positiveIntegerFromEnv(platform, 'CONDUITS_THROTTLE_BAN_AFTER'),
    banMs: positiveIntegerFromEnv(platform, 'CONDUITS_THROTTLE_BAN_MS'),
  }
  if (limits.banAfter <= limits.requests) throw new Error('CONDUITS_THROTTLE_BAN_AFTER must be greater than CONDUITS_THROTTLE_REQUESTS')
  return limits
}

// How long the gateway keeps a create's Idempotency-Key, from
// CONDUITS_IDEMPOTENCY_TTL_MS, required.
export function idempotencyTtlMsFromEnv(platform: PlatformEnvironment): number {
  return positiveIntegerFromEnv(platform, 'CONDUITS_IDEMPOTENCY_TTL_MS')
}

// The folder the gateway keeps its state files in (the throttle's
// counts and the idempotency keys), from CONDUITS_STATE_DIR: an absolute path, or null when unset,
// and the state is then kept in memory. Throws on a relative path, which
// would depend on the folder the gateway was started from.
export function stateDirFromEnv(platform: PlatformEnvironment): string | null {
  const dir = platform.CONDUITS_STATE_DIR?.trim()
  if (!dir) return null
  if (!path.isAbsolute(dir)) throw new Error(`CONDUITS_STATE_DIR must be an absolute path (got ${JSON.stringify(dir)})`)
  return dir
}
