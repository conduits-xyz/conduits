import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { generateBearerToken, hashBearerToken } from '../bearer-token.ts'
import type { ConduitConfig } from '../types.ts'
import { fakeConduit } from './fake-gateway.ts'

// GET <route>/.conduits/schema: the fields a caller can send, under the
// names the caller uses.

// A conduit with a key, and the fields its schema names.
function conduit(overrides: Partial<ConduitConfig> = {}) {
  const token = generateBearerToken()
  const { gateway, send, json } = fakeConduit('schema', { apiKeys: [{ tokenHash: hashBearerToken(token), scopes: ['GET'] }], ...overrides })
  const create = (fields: Record<string, unknown>) => json('POST', '', { fields })
  const fieldNames = async () => {
    const response = await send('/.conduits/schema', { headers: { authorization: `Bearer ${token}` } })
    assert.equal(response.status, 200)
    return ((await response.json()) as { fields: { name: string }[] }).fields.map((field) => field.name).sort()
  }
  return { gateway, create, fieldNames }
}

describe('schema', () => {
  it("lists the table's fields, not an item's", async () => {
    const { gateway, fieldNames } = conduit()
    gateway.sheets.seed(gateway.suriObjectKey, [{ name: 'Ada', age: 36 }])
    assert.deepEqual(await fieldNames(), ['age', 'name'])
  })

  it('names each field as the caller sends it, through the field map', async () => {
    const { gateway, fieldNames } = conduit({ suriConfig: { fieldMap: { name: 'Full Name (Required)' } } })
    gateway.sheets.seed(gateway.suriObjectKey, [{ 'Full Name (Required)': 'Ada' }])
    assert.deepEqual(await fieldNames(), ['name'])
  })

  it('never lists a honeypot field, which is never stored', async () => {
    const { create, fieldNames } = conduit({ hiddenFormField: [{ fieldName: 'website', policy: 'drop-if-filled' }] })
    assert.equal((await create({ name: 'Ada', website: '' })).status, 201)
    assert.deepEqual(await fieldNames(), ['name'])
  })

  it('lists a pass-if-match field that include stores', async () => {
    const { create, fieldNames } = conduit({ hiddenFormField: [{ fieldName: 'campaign', policy: 'pass-if-match', value: 'spring-2026', include: true }] })
    assert.equal((await create({ name: 'Ada', campaign: 'spring-2026' })).status, 201)
    assert.deepEqual(await fieldNames(), ['campaign', 'name'])
  })
})
