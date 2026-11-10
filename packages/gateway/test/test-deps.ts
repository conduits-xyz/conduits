import { createFakeSheets, type FakeSheets } from '@conduits/conduit/testing'

import type { GatewayClock, GatewayDeps } from '../index.ts'
import { testIdempotency, unreachedThrottle } from '../testing.ts'

// The dependencies every test router needs: an in-memory Google Sheets
// (`sheets`, to seed and read), a clock the test controls, a throttle
// no test reaches unless it sets its own, idempotency keys in memory, no
// trusted forwarders, and counting request ids.
export function testDeps(): Pick<GatewayDeps, 'sourceClients' | 'clock' | 'throttle' | 'idempotency' | 'trustedForwarders' | 'requestId'> & {
  clock: GatewayClock & { advance(ms: number): void }
  sheets: FakeSheets
} {
  let ms = 0
  let next = 0
  const now = () => Date.UTC(2026, 9, 5, 12) + ms
  const sheets = createFakeSheets(now)
  return {
    sheets,
    sourceClients: { googleSheets: sheets.client },
    clock: {
      now: () => new Date(now()),
      monotonicMs: () => ms,
      advance(by) {
        ms += by
      },
    },
    throttle: unreachedThrottle(),
    idempotency: testIdempotency(),
    trustedForwarders: [],
    requestId: () => `req-${++next}`,
  }
}
