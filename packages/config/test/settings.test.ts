import * as assert from 'remix/assert'
import { afterEach, describe, it } from 'remix/test'

import { googleSheetsOptionsFromEnv, listLimitsFromEnv, throttleLimitsFromEnv, trustedForwardersFromEnv } from '../settings.ts'

const NAMES = [
  'CONDUITS_LIST_DEFAULT_LIMIT',
  'CONDUITS_LIST_MAX_LIMIT',
  'CONDUITS_SHEETS_READ_CACHE_MS',
  'CONDUITS_SHEETS_REQUESTS_PER_MINUTE',
  'CONDUITS_SHEETS_REQUESTS_PER_MINUTE_PER_ACCOUNT',
  'CONDUITS_THROTTLE_REQUESTS',
  'CONDUITS_THROTTLE_WINDOW_MS',
  'CONDUITS_THROTTLE_BAN_AFTER',
  'CONDUITS_THROTTLE_BAN_MS',
  'CONDUITS_TRUSTED_FORWARDERS',
]

describe('settings from the environment', () => {
  const saved = Object.fromEntries(NAMES.map((name) => [name, process.env[name]]))
  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  })

  it('reads the list limits, and refuses a default above the maximum', () => {
    process.env.CONDUITS_LIST_DEFAULT_LIMIT = '100'
    process.env.CONDUITS_LIST_MAX_LIMIT = '1000'
    assert.deepEqual(listLimitsFromEnv(), { default: 100, max: 1000 })
    process.env.CONDUITS_LIST_DEFAULT_LIMIT = '2000'
    assert.throws(() => listLimitsFromEnv(), /must not exceed/)
  })

  it('reads the throttle limits, and refuses a ban threshold not above the request limit', () => {
    process.env.CONDUITS_THROTTLE_REQUESTS = '5'
    process.env.CONDUITS_THROTTLE_WINDOW_MS = '1000'
    process.env.CONDUITS_THROTTLE_BAN_AFTER = '50'
    process.env.CONDUITS_THROTTLE_BAN_MS = '600000'
    assert.deepEqual(throttleLimitsFromEnv(), { requests: 5, windowMs: 1000, banAfter: 50, banMs: 600000 })
    process.env.CONDUITS_THROTTLE_BAN_AFTER = '5'
    assert.throws(() => throttleLimitsFromEnv(), /CONDUITS_THROTTLE_BAN_AFTER must be greater than CONDUITS_THROTTLE_REQUESTS/)
  })

  it('reads the trusted forwarders as a list, empty when unset', () => {
    process.env.CONDUITS_TRUSTED_FORWARDERS = '10.0.0.5, 10.0.0.6'
    assert.deepEqual(trustedForwardersFromEnv(), ['10.0.0.5', '10.0.0.6'])
    delete process.env.CONDUITS_TRUSTED_FORWARDERS
    assert.deepEqual(trustedForwardersFromEnv(), [])
  })

  it('requires each setting, as a positive whole number', () => {
    delete process.env.CONDUITS_SHEETS_READ_CACHE_MS
    assert.throws(() => googleSheetsOptionsFromEnv(), /CONDUITS_SHEETS_READ_CACHE_MS is required/)
    process.env.CONDUITS_SHEETS_READ_CACHE_MS = '1.5'
    assert.throws(() => googleSheetsOptionsFromEnv(), /CONDUITS_SHEETS_READ_CACHE_MS must be a positive whole number/)
  })
})
