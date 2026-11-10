import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { googleSheetsOptionsFromEnv, listLimitsFromEnv, stateDirFromEnv, throttleLimitsFromEnv, trustedForwardersFromEnv } from '../settings.ts'

describe('settings from the platform environment', () => {
  it('reads the list limits, and refuses a default above the maximum', () => {
    assert.deepEqual(listLimitsFromEnv({ CONDUITS_LIST_DEFAULT_LIMIT: '100', CONDUITS_LIST_MAX_LIMIT: '1000' }), { default: 100, max: 1000 })
    assert.throws(() => listLimitsFromEnv({ CONDUITS_LIST_DEFAULT_LIMIT: '2000', CONDUITS_LIST_MAX_LIMIT: '1000' }), /must not exceed/)
  })

  it('reads the throttle limits, and refuses a ban threshold not above the request limit', () => {
    const limits = { CONDUITS_THROTTLE_REQUESTS: '5', CONDUITS_THROTTLE_WINDOW_MS: '1000', CONDUITS_THROTTLE_BAN_AFTER: '50', CONDUITS_THROTTLE_BAN_MS: '600000' }
    assert.deepEqual(throttleLimitsFromEnv(limits), { requests: 5, windowMs: 1000, banAfter: 50, banMs: 600000 })
    assert.throws(() => throttleLimitsFromEnv({ ...limits, CONDUITS_THROTTLE_BAN_AFTER: '5' }), /CONDUITS_THROTTLE_BAN_AFTER must be greater than CONDUITS_THROTTLE_REQUESTS/)
  })

  it('reads the trusted forwarders as a list, empty when unset', () => {
    assert.deepEqual(trustedForwardersFromEnv({ CONDUITS_TRUSTED_FORWARDERS: '10.0.0.5, 10.0.0.6' }), ['10.0.0.5', '10.0.0.6'])
    assert.deepEqual(trustedForwardersFromEnv({}), [])
  })

  it('reads the state folder as an absolute path, null when unset, and refuses a relative one', () => {
    assert.equal(stateDirFromEnv({ CONDUITS_STATE_DIR: '/var/lib/conduits' }), '/var/lib/conduits')
    assert.throws(() => stateDirFromEnv({ CONDUITS_STATE_DIR: 'state' }), /CONDUITS_STATE_DIR must be an absolute path/)
    assert.equal(stateDirFromEnv({}), null)
  })

  it('requires each setting, as a positive whole number', () => {
    assert.throws(() => googleSheetsOptionsFromEnv({}), /CONDUITS_SHEETS_READ_CACHE_MS is required/)
    assert.throws(() => googleSheetsOptionsFromEnv({ CONDUITS_SHEETS_READ_CACHE_MS: '1.5' }), /CONDUITS_SHEETS_READ_CACHE_MS must be a positive whole number/)
  })
})
