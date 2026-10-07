import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import type { ConduitSourceClient } from '@conduits/conduit'

import type { GatewayRuntime } from '../types.ts'
import { createFakeGateway } from './fake-gateway.ts'

// The source is opened only when an action needs its table, so a
// request the action refuses or drops never gets the credential, calls
// the provider or counts as provider traffic.

function setup() {
  const curi = `opening-${Math.random().toString(36).slice(2)}`
  const gateway = createFakeGateway(curi)
  const calls = { credential: 0, connect: 0, instrument: 0 }
  const sheets = gateway.sheets.client
  const counting: ConduitSourceClient = {
    ...sheets,
    connect: (...args) => {
      calls.connect++
      return sheets.connect(...args)
    },
  }
  const runtime: GatewayRuntime = {
    async getCredential() {
      calls.credential++
      return 'fake-credential'
    },
    async invalidateCredential() {},
    instrumentFetch() {
      calls.instrument++
      return { fetchImpl: fetch, finish: () => ({ providerRequestBytes: 0, providerResponseBytes: 0, providerAttempted: true }) }
    },
  }
  const config = gateway.baseConfig({
    hiddenFormField: [{ fieldName: 'website', policy: 'drop-if-filled' }],
    suriConfig: { fieldMap: { name: 'Name' } },
  })
  const router = gateway.makeRouter(config, { sourceClients: { googleSheets: counting }, runtime })
  const post = (body: unknown) =>
    router.fetch(new Request(`http://gateway.test/${curi}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
  return { curi, router, calls, post, gateway }
}

describe('opening the source', () => {
  it('a submission the honeypot drops never reaches the source', async () => {
    const { calls, post } = setup()
    const response = await post({ fields: { name: 'Spam', website: 'https://spam.example' } })
    assert.equal(response.status, 201)
    assert.deepEqual(calls, { credential: 0, connect: 0, instrument: 0 })
  })

  it('a request the action refuses never reaches the source', async () => {
    const { curi, router, calls, post } = setup()
    assert.equal((await post({})).status, 400)
    assert.equal((await post({ fields: { name: 'A' }, extra: true })).status, 400)
    assert.equal((await router.fetch(new Request(`http://gateway.test/${curi}?limit=0`))).status, 400)
    assert.deepEqual(calls, { credential: 0, connect: 0, instrument: 0 })
  })

  it('a write opens the source once', async () => {
    const { calls, post } = setup()
    assert.equal((await post({ fields: { name: 'Ada' } })).status, 201)
    assert.deepEqual(calls, { credential: 1, connect: 1, instrument: 1 })
  })

  it('a conduit with no usable credential is a 502 when its source is needed', async () => {
    const curi = `opening-${Math.random().toString(36).slice(2)}`
    const gateway = createFakeGateway(curi)
    const runtime: GatewayRuntime = { async getCredential() { return null }, async invalidateCredential() {} }
    const router = gateway.makeRouter(gateway.baseConfig(), { runtime })
    const response = await router.fetch(new Request(`http://gateway.test/${curi}`))
    assert.equal(response.status, 502)
    const body = (await response.json()) as { code: string; detail: string }
    assert.equal(body.code, 'source_unavailable')
    assert.equal(body.detail, 'The conduit has no usable credential.')
  })
})
