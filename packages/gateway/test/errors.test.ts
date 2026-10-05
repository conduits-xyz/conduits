import * as assert from 'remix/assert'
import { beforeEach, describe, it } from 'remix/test'
import { resetFakeSheets, seedFakeSheet } from '@conduits/conduit'

import { resetThrottle } from '../middleware/throttle.ts'
import { classifyStatus } from '../observation.ts'
import { createFakeGateway } from './fake-gateway.ts'

// Each error is RFC 9457 Problem Details with the gateway's `code`
// (docs/gateway-api.md#errors).

interface Problem {
  type: string
  title: string
  status: number
  detail?: string
  code: string
  errors?: { code: string; field?: string; pointer: string; detail: string }[]
  retryAfter?: number
}

async function problem(response: Response): Promise<Problem> {
  assert.equal(response.headers.get('content-type'), 'application/problem+json')
  const body = (await response.json()) as Problem
  assert.equal(body.status, response.status, 'status in the body equals the response status')
  return body
}

const json = (body: unknown, method = 'POST') => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('error responses', () => {
  beforeEach(() => {
    resetFakeSheets()
    resetThrottle()
  })

  it('names each unknown field of a bulk create, with the record it is in', async () => {
    const curi = `errors-${Math.random().toString(36).slice(2)}`
    const gateway = createFakeGateway(curi)
    seedFakeSheet(gateway.suriObjectKey, [{ name: 'Ada' }])
    const router = gateway.makeRouter(gateway.baseConfig())
    const response = await router.fetch(
      new Request(`http://gateway.test/${curi}`, json({ records: [{ fields: { name: 'Ada' } }, { fields: { name: 'Grace', phone: '1' } }, { fields: { phone: '2' } }] })),
    )
    const body = await problem(response)
    assert.equal(body.code, 'unknown_field')
    assert.equal(body.type, 'https://github.com/conduits-xyz/conduits/blob/main/docs/gateway-api.md#unknown-field')
    assert.deepEqual(body.errors?.map((error) => error.pointer), ['/records/1/fields/phone', '/records/2/fields/phone'])
  })

  it('names an unknown field as the client sent it, through a field map', async () => {
    const curi = `errors-${Math.random().toString(36).slice(2)}`
    const gateway = createFakeGateway(curi)
    seedFakeSheet(gateway.suriObjectKey, [{ name: 'Ada' }])
    const send = async (fieldMap: Record<string, string>, fields: Record<string, string>) =>
      problem(await gateway.makeRouter(gateway.baseConfig({ suriConfig: { fieldMap } })).fetch(new Request(`http://gateway.test/${curi}`, json({ fields }))))

    // The sheet has no 'Full Name' column: the source reports the column,
    // and the error gives the client's name for it.
    const fromSource = await send({ fullName: 'Full Name' }, { fullName: 'Ada' })
    assert.deepEqual(fromSource.errors?.map((error) => error.field), ['fullName'])

    // The client sent a column name that is not one of its field names.
    const fromClient = await send({ name: 'Full Name' }, { 'Full Name': 'Ada' })
    assert.deepEqual(fromClient.errors?.map((error) => error.field), ['Full Name'])
  })

  it('gives a 429 its retry time in the body and in the header', async () => {
    const curi = `errors-${Math.random().toString(36).slice(2)}`
    const gateway = createFakeGateway(curi)
    const router = gateway.makeRouter(gateway.baseConfig({ throttle: true }))
    // The throttle allows 5 requests each second; the sixth is refused.
    for (let i = 0; i < 5; i++) assert.equal((await router.fetch(new Request(`http://gateway.test/${curi}`))).status, 200)
    const response = await router.fetch(new Request(`http://gateway.test/${curi}`))
    const body = await problem(response)
    assert.equal(body.code, 'rate_limited')
    assert.equal(body.retryAfter, 1)
    assert.equal(response.headers.get('retry-after'), '1')
  })

  it('gives each refusal its own code', async () => {
    const curi = `errors-${Math.random().toString(36).slice(2)}`
    const gateway = createFakeGateway(curi)
    seedFakeSheet(gateway.suriObjectKey, [{ name: 'Ada' }])
    const router = gateway.makeRouter(gateway.baseConfig(), { listLimits: { default: 2, max: 3 } })
    const send = (path: string, init?: RequestInit) => router.fetch(new Request(`http://gateway.test${path}`, init))

    const notAllowed = await send(`/${curi}`, { method: 'DELETE' })
    assert.equal((await problem(notAllowed)).code, 'method_not_allowed')
    assert.equal(notAllowed.headers.get('allow'), 'GET, POST')

    assert.equal((await problem(await send('/no-such-conduit'))).code, 'not_found')
    assert.equal((await problem(await send(`/${curi}/no-such-id`))).code, 'record_not_found')
    assert.equal((await problem(await send(`/${curi}?limit=4`))).code, 'invalid_limit')
    assert.equal((await problem(await send(`/${curi}?cursor=nope`))).code, 'unknown_cursor')
    assert.equal((await problem(await send(`/${curi}`, json({ id: 'x', fields: { name: 'A' } })))).code, 'id_not_allowed')
    assert.equal((await problem(await send(`/${curi}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' }))).code, 'invalid_body')
  })
  it("counts the throttle's 429 as the caller's, and a busy source's 503 as the provider's", () => {
    assert.equal(classifyStatus(429), 'rejected')
    assert.equal(classifyStatus(503), 'providerError')
    assert.equal(classifyStatus(502), 'providerError')
  })
})
