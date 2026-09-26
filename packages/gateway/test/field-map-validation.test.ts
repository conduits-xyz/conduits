import * as assert from 'remix/assert'
import { describe, it, beforeEach } from 'remix/test'
import { resetFakeSheets } from '@conduits/conduit'

import { resetThrottle } from '../middleware/throttle.ts'
import { createFakeGateway } from './fake-gateway.ts'

// Exercises checkKnownFields (packages/conduit/field-map.ts) through
// the real dispatch path, via the same createGatewayRouter/fake-sheets
// setup page-controller.test.ts uses. Sheets, not Gmail/Fastmail, since
// it's the one suri_type with a network-free fake client — the check
// itself runs identically for every suri_type (see controller.ts/
// item-controller.ts).
const CURI = 'field-map-smoke'

const { baseConfig, makeRouter } = createFakeGateway(CURI)

async function postFields(router: ReturnType<typeof makeRouter>, fields: Record<string, unknown>) {
  return router.fetch(
    new Request(`http://localhost/${CURI}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fields }),
    }),
  )
}

describe('gateway-wide field schema enforcement (checkKnownFields, wired)', () => {
  beforeEach(() => {
    resetFakeSheets()
    resetThrottle()
  })

  it('rejects a field outside a declared, non-empty schema — even on a genuinely blank source with no columns of its own yet', async () => {
    // Deliberately never seeded (resetFakeSheets, no seedFakeSheet call)
    // — a genuinely blank sheet, the one case ensureColumnsForWrite
    // would not reject on its own (it bootstraps instead). Rejecting
    // here proves checkKnownFields itself does the work, independent of
    // Sheets' own live-header check.
    const router = makeRouter(baseConfig({ suriConfig: { fieldMap: { name: 'name' } } }))
    const response = await postFields(router, { phone: '555-0100' })
    assert.equal(response.status, 400)
    const body = (await response.json()) as { error: string }
    assert.match(body.error, /'phone'/)
  })

  it('still accepts anything when no schema is declared at all — the existing passthrough default, unchanged', async () => {
    const router = makeRouter(baseConfig({ suriConfig: {} }))
    const response = await postFields(router, { anything: 'x', goes: 'y' })
    assert.equal(response.status, 201)
  })

  it('accepts every field that is part of the declared schema', async () => {
    const router = makeRouter(baseConfig({ suriConfig: { fieldMap: { name: 'name', email: 'email' } } }))
    const response = await postFields(router, { name: 'Ada', email: 'ada@example.com' })
    assert.equal(response.status, 201)
  })
})
