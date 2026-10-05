import { createFakeSheets, type FakeSheets } from '@conduits/conduit/testing'

import type { GatewayClock, GatewayDeps } from '../index.ts'

// The dependencies every test router needs: an in-memory Google Sheets
// (`sheets`, to seed and read), a clock the test controls, and counting
// request ids.
export function testDeps(): Pick<GatewayDeps, 'sourceClients' | 'clock' | 'requestId'> & {
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
    requestId: () => `req-${++next}`,
  }
}
