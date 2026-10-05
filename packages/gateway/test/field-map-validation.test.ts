import * as assert from 'remix/assert'
import { describe, it, beforeEach } from 'remix/test'
import { resetFakeSheets } from '@conduits/conduit'

import { resetThrottle } from '../middleware/throttle.ts'
import { createFakeGateway } from './fake-gateway.ts'

// checkKnownFields (packages/conduit/field-map.ts) through dispatch,
// using the fake Sheets client, the only network-free one. The check is
// the same for every suri_type.
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
    // A blank sheet, which ensureColumnsForWrite would accept (it adds
    // the columns), so the rejection comes from checkKnownFields.
    const router = makeRouter(baseConfig({ suriConfig: { fieldMap: { name: 'name' } } }))
    const response = await postFields(router, { phone: '555-0100', fax: '555-0101' })
    assert.equal(response.status, 400)
    assert.equal(response.headers.get('content-type'), 'application/problem+json')
    const body = (await response.json()) as { status: number; code: string; errors: { code: string; field: string; pointer: string }[] }
    assert.equal(body.status, 400)
    assert.equal(body.code, 'unknown_field')
    assert.deepEqual(
      body.errors.map((error) => [error.code, error.field, error.pointer]),
      [
        ['unknown_field', 'phone', '/fields/phone'],
        ['unknown_field', 'fax', '/fields/fax'],
      ],
      'every unknown field, each with a pointer into the body',
    )
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
