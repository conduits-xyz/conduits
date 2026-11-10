import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { generateBearerToken, hashBearerToken } from '../bearer-token.ts'
import type { GatewayObservation } from '../observation.ts'
import type { ConduitConfig } from '../types.ts'
import { fakeConduit, fakeRuntime } from './fake-gateway.ts'

// The observation the gateway reports for each request it answers
// (GatewayRuntime.recordObservation): a host can count hits and dropped
// submissions from it, and measure the provider traffic.

// A conduit whose runtime keeps each observation.
function observing(overrides: Partial<ConduitConfig> = {}) {
  const observations: GatewayObservation[] = []
  const conduit = fakeConduit('observed', overrides, { runtime: { ...fakeRuntime, recordObservation: (observation) => void observations.push(observation) } })
  return { ...conduit, observations }
}

describe('observations', () => {
  it('reports a request RACM refuses as rejected, and one it serves as a success', async () => {
    const { curi, observations, send, json } = observing({ racm: ['GET'] })

    assert.equal((await json('POST', '', { fields: { name: 'x' } })).status, 405)
    assert.equal((await send()).status, 200)
    assert.deepEqual(
      observations.map(({ curi, method, routeKind, statusClass }) => ({ curi, method, routeKind, statusClass })),
      [
        { curi, method: 'POST', routeKind: 'bare', statusClass: 'rejected' },
        { curi, method: 'GET', routeKind: 'bare', statusClass: 'success' },
      ],
    )
  })

  it('reports each submission a hidden field drops, single and bulk', async () => {
    const { observations, json } = observing({ hiddenFormField: [{ fieldName: 'website', policy: 'drop-if-filled' }] })

    assert.equal((await json('POST', '', { fields: { name: 'Bot', website: 'https://spam.example' } })).status, 201)
    const bulk = { records: [{ fields: { name: 'Real' } }, { fields: { name: 'Bot1', website: 'https://spam.example' } }, { fields: { name: 'Bot2', website: 'https://spam.example' } }] }
    assert.equal((await json('POST', '', bulk)).status, 201)
    assert.deepEqual(
      observations.map(({ statusClass, honeypotDropCount }) => ({ statusClass, honeypotDropCount })),
      [
        { statusClass: 'success', honeypotDropCount: 1 },
        { statusClass: 'success', honeypotDropCount: 2 },
      ],
    )
  })

  it('reports a schema request without a valid key as rejected, and names the key a served one used', async () => {
    const token = generateBearerToken()
    const { observations, send } = observing({ apiKeys: [{ id: 'key-1', tokenHash: hashBearerToken(token), scopes: ['GET'] }] })
    const schema = (bearer?: string) => send('/.conduits/schema', bearer ? { headers: { authorization: `Bearer ${bearer}` } } : {})

    assert.equal((await schema()).status, 401)
    assert.equal((await schema(generateBearerToken())).status, 401)
    assert.equal((await schema(token)).status, 200)
    assert.deepEqual(
      observations.map(({ routeKind, statusClass, apiKeyId }) => ({ routeKind, statusClass, apiKeyId })),
      [
        { routeKind: 'schema', statusClass: 'rejected', apiKeyId: undefined },
        { routeKind: 'schema', statusClass: 'rejected', apiKeyId: undefined },
        { routeKind: 'schema', statusClass: 'success', apiKeyId: 'key-1' },
      ],
    )
  })
})
