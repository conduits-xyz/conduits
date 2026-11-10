import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import type { ConduitConfig } from '../types.ts'
import { createFakeGateway } from './fake-gateway.ts'

type Problem = { code: string; errors?: { pointer: string }[] }
type WireRecord = { id: string; etag: string; fields: Record<string, unknown> }

// A conduit open to every method, with two records, Ada and Grace.
function conduit(overrides: Partial<ConduitConfig> = {}) {
  const gateway = createFakeGateway('etags')
  const { curi } = gateway
  const [ada, grace] = gateway.sheets.seed(gateway.suriObjectKey, [{ name: 'Ada' }, { name: 'Grace' }])
  const router = gateway.makeRouter(gateway.baseConfig({ racm: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], ...overrides }))
  const send = (path: string, method = 'GET', body?: unknown, headers: Record<string, string> = {}) =>
    router.fetch(new Request(`http://gateway.test/${curi}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }))
  const names = () => gateway.sheets.records(gateway.suriObjectKey).map((record) => record.fields.name)
  return { send, names, ada: ada!.id, grace: grace!.id }
}

describe('ETags and If-Match', () => {
  it('gives a record the same ETag in its header, its body and a list read, and a new one after a change', async () => {
    const { send, ada } = conduit()
    const read = await send(`/${ada}`)
    const etag = read.headers.get('etag')!
    assert.match(etag, /^"[2-9a-z]{26}"$/)
    assert.equal(((await read.json()) as WireRecord).etag, etag)
    const listed = ((await (await send('')).json()) as { records: WireRecord[] }).records
    assert.equal(listed.find((record) => record.id === ada)!.etag, etag)

    const patched = await send(`/${ada}`, 'PATCH', { fields: { name: 'Ada L.' } }, { 'if-match': etag })
    assert.equal(patched.status, 200)
    assert.notEqual(patched.headers.get('etag'), etag)
    assert.equal(patched.headers.get('etag'), (await send(`/${ada}`)).headers.get('etag'), 'the write gives the ETag a later read gives')
  })

  it('refuses a change to a record that changed since it was read (412), with its current ETag, and writes nothing', async () => {
    const { send, names, ada } = conduit()
    const stale = (await send(`/${ada}`)).headers.get('etag')!
    const current = (await send(`/${ada}`, 'PATCH', { fields: { name: 'Ada L.' } })).headers.get('etag')

    for (const [method, body] of [['PATCH', { fields: { name: 'Ada K.' } }], ['PUT', { fields: { name: 'Ada K.' } }], ['DELETE', undefined]] as const) {
      const refused = await send(`/${ada}`, method, body, { 'if-match': stale })
      assert.equal(refused.status, 412, method)
      assert.equal(((await refused.json()) as Problem).code, 'precondition_failed')
      assert.equal(refused.headers.get('etag'), current)
    }
    assert.deepEqual(names(), ['Ada L.', 'Grace'])
    assert.equal((await send(`/${ada}`, 'DELETE', undefined, { 'if-match': '*' })).status, 200)
  })

  it('refuses a bulk change if one record changed, pointing at its etag, and writes nothing', async () => {
    const { send, names, ada, grace } = conduit()
    const [adaTag, graceTag] = ((await (await send('')).json()) as { records: WireRecord[] }).records.map((record) => record.etag)
    await send(`/${grace}`, 'PATCH', { fields: { name: 'Grace H.' } })

    const update = await send('', 'PATCH', { records: [{ id: ada, etag: adaTag, fields: { name: 'A' } }, { id: grace, etag: graceTag, fields: { name: 'G' } }] })
    assert.equal(update.status, 412)
    assert.deepEqual(((await update.json()) as Problem).errors!.map((error) => error.pointer), ['/records/1/etag'])
    const remove = await send('', 'DELETE', { ids: [grace, ada], etags: [graceTag, adaTag] })
    assert.equal(remove.status, 412)
    assert.deepEqual(((await remove.json()) as Problem).errors!.map((error) => error.pointer), ['/etags/0'])
    assert.deepEqual(names(), ['Ada', 'Grace H.'])

    assert.equal((await send('', 'PATCH', { records: [{ id: ada, etag: adaTag, fields: { name: 'A' } }] })).status, 200)
    assert.equal((await send('', 'DELETE', { ids: [ada], etags: ['"stale"', '"extra"'] })).status, 400, 'one etag for each id')
  })

  it('requires the ETag on every change when the conduit says so (428), and not on a create or a read', async () => {
    const { send, ada, grace } = conduit({ ifMatchRequired: true })
    const etag = (await send(`/${ada}`)).headers.get('etag')!
    assert.equal((await send(`/${ada}`, 'PATCH', { fields: { name: 'A' } })).status, 428)
    assert.equal((await send(`/${ada}`, 'DELETE')).status, 428)
    assert.equal((await send('', 'PATCH', { records: [{ id: ada, etag, fields: { name: 'A' } }, { id: grace, fields: { name: 'G' } }] })).status, 428)
    assert.equal((await send('', 'DELETE', { ids: [ada] })).status, 428)
    assert.equal((await send(`/${ada}`, 'PATCH', { fields: { name: 'A' } }, { 'if-match': etag })).status, 200)
    assert.equal((await send('', 'POST', { fields: { name: 'Mary' } })).status, 201)
  })

  it('lets a browser send If-Match and read ETag', async () => {
    const { send, ada } = conduit()
    const preflight = await send(`/${ada}`, 'OPTIONS', undefined, { origin: 'https://site.example', 'access-control-request-method': 'PATCH' })
    assert.match(preflight.headers.get('access-control-allow-headers')!, /If-Match/)
    assert.match((await send(`/${ada}`, 'GET', undefined, { origin: 'https://site.example' })).headers.get('access-control-expose-headers')!, /ETag/)
  })
})
