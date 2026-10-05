import * as assert from 'remix/assert'
import { afterEach, describe, it } from 'remix/test'

import { googleSheetsOptionsFromEnv, listLimitsFromEnv } from '../settings.ts'

const NAMES = [
  'CONDUITS_LIST_DEFAULT_LIMIT',
  'CONDUITS_LIST_MAX_LIMIT',
  'CONDUITS_SHEETS_READ_CACHE_MS',
  'CONDUITS_SHEETS_REQUESTS_PER_MINUTE',
  'CONDUITS_SHEETS_REQUESTS_PER_MINUTE_PER_ACCOUNT',
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

  it('requires each setting, as a positive whole number', () => {
    delete process.env.CONDUITS_SHEETS_READ_CACHE_MS
    assert.throws(() => googleSheetsOptionsFromEnv(), /CONDUITS_SHEETS_READ_CACHE_MS is required/)
    process.env.CONDUITS_SHEETS_READ_CACHE_MS = '1.5'
    assert.throws(() => googleSheetsOptionsFromEnv(), /CONDUITS_SHEETS_READ_CACHE_MS must be a positive whole number/)
  })
})
