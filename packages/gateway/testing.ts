import { createMemoryThrottleStore, type Throttle } from './middleware/throttle.ts'
import type { ConduitConfig } from './types.ts'

// For tests: a throttle with its own store, whose limits no test reaches
// unless it sends hundreds of requests from one address.
export function unreachedThrottle(): Throttle {
  return { limits: { requests: 1000, windowMs: 1000, banAfter: 1001, banMs: 1000 }, store: createMemoryThrottleStore() }
}

// For tests: a Google Sheets conduit open to POST, with no allowlist,
// keys, fields or hidden fields. `overrides` replace any of it.
export function testConduitConfig(overrides: Partial<ConduitConfig> = {}): ConduitConfig {
  return {
    curi: 'contact-form',
    allowlist: [],
    racm: ['POST'],
    tokenRequiredMethods: [],
    apiKeys: [],
    suriType: 'googleSheets',
    suriObjectKey: '1AbC',
    suriConfig: {},
    fields: {},
    hiddenFormField: [],
    credentialRef: 'google:123',
    ...overrides,
  }
}
