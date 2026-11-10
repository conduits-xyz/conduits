import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import type { ConduitConfig } from '../types.ts'
import { fakeConduit } from './fake-gateway.ts'

// Writing and reading records through the wire API: the bodies it
// takes and refuses, single and bulk writes, and what a hidden form
// field does to a create.

// A conduit that takes every method, and the fields of the records its
// sheet holds.
function conduit(overrides: Partial<ConduitConfig> = {}) {
  const { gateway, send, json } = fakeConduit('records', { racm: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], ...overrides })
  const stored = () => gateway.sheets.records(gateway.suriObjectKey).map((record) => record.fields)
  return { gateway, send, json, stored }
}

const code = async (response: Response) => [response.status, ((await response.json()) as { code: string }).code]

const HONEYPOT = { hiddenFormField: [{ fieldName: 'website', policy: 'drop-if-filled' as const }] }

describe('records', () => {
  it('refuses a body it cannot take, with its code, and writes nothing', async () => {
    const { gateway, send, json, stored } = conduit()
    const [ada] = gateway.sheets.seed(gateway.suriObjectKey, [{ name: 'Ada' }])
    const id = ada!.id
    const eleven = Array.from({ length: 11 }, (_, i) => ({ fields: { name: `Row ${i}` } }))

    assert.deepEqual(await code(await json('POST', '', { name: 'not in fields' })), [400, 'unknown_member'])
    assert.deepEqual(await code(await json('POST', '', { records: [{ id: 'mine', fields: { name: 'B' } }] })), [400, 'id_not_allowed'])
    assert.deepEqual(await code(await json('POST', '', { records: eleven })), [400, 'too_many_records'])
    assert.deepEqual(await code(await json('PATCH', '', { records: eleven.map((record) => ({ id, ...record })) })), [400, 'too_many_records'])
    assert.deepEqual(await code(await json('DELETE', '', { ids: Array.from({ length: 11 }, () => id) })), [400, 'too_many_records'])
    assert.deepEqual(await code(await json('PATCH', '', { records: [{ id, fields: { name: 'x' } }, { id, fields: { name: 'y' } }] })), [400, 'duplicate_ids'])
    assert.deepEqual(await code(await json('DELETE', '', { ids: [id, id] })), [400, 'duplicate_ids'])
    assert.deepEqual(await code(await json('PUT', `/${id}`, { id, fields: { name: 'x' } })), [400, 'id_not_allowed'])
    assert.deepEqual(await code(await json('PATCH', `/${id}`, { id, fields: { name: 'x' } })), [400, 'id_not_allowed'])
    assert.equal((await send('', { method: 'DELETE' })).status, 400)
    assert.deepEqual(stored(), [{ name: 'Ada' }])
  })

  it('takes a plain form, bracketed field names and multipart as it takes JSON', async () => {
    const { send } = conduit()
    const created = async (init: RequestInit) => {
      const response = await send('', { method: 'POST', ...init })
      assert.equal(response.status, 201)
      return ((await response.json()) as { fields: Record<string, unknown> }).fields
    }
    const form = (fields: Record<string, string>) => ({ headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() })
    const multipart = new FormData()
    multipart.set('name', 'Ada')
    multipart.set('email', 'ada@example.com')

    assert.deepEqual(await created(form({ name: 'Ada', email: 'ada@example.com' })), { name: 'Ada', email: 'ada@example.com' })
    assert.deepEqual(await created(form({ 'fields[name]': 'Ada' })), { name: 'Ada' })
    assert.deepEqual(await created({ body: multipart }), { name: 'Ada', email: 'ada@example.com' })
  })

  it('creates, lists, reads, replaces, updates and deletes one record', async () => {
    const { send, json } = conduit()
    const body = async (response: Response, status: number) => {
      assert.equal(response.status, status)
      return (await response.json()) as { id: string; createdTime: string; fields: Record<string, unknown>; records: unknown[] }
    }

    const created = await body(await json('POST', '', { fields: { name: 'Grace', email: 'grace@example.com' } }), 201)
    assert.ok(created.createdTime)
    assert.equal((await body(await send(), 200)).records.length, 1)
    assert.deepEqual((await body(await send(`/${created.id}`), 200)).fields, { name: 'Grace', email: 'grace@example.com' })
    assert.deepEqual((await body(await json('PUT', `/${created.id}`, { fields: { name: 'Grace Hopper' } }), 200)).fields, { name: 'Grace Hopper' })
    assert.deepEqual((await body(await json('PATCH', `/${created.id}`, { fields: { email: 'ghopper@example.com' } }), 200)).fields, { name: 'Grace Hopper', email: 'ghopper@example.com' })
    assert.deepEqual(await body(await send(`/${created.id}`, { method: 'DELETE' }), 200), { id: created.id, deleted: true })
    assert.equal((await send(`/${created.id}`)).status, 404)
    assert.equal((await send(`/${created.id}`, { method: 'DELETE' })).status, 404)
  })

  it('creates, updates, replaces and deletes several records at once', async () => {
    const { json, stored } = conduit()
    const records = async (response: Response) => {
      assert.ok(response.ok, String(response.status))
      return ((await response.json()) as { records: { id: string; fields: Record<string, unknown> }[] }).records
    }

    const [alice, bob] = await records(await json('POST', '', { records: [{ fields: { name: 'Alice', role: '' } }, { fields: { name: 'Bob', role: '' } }] }))
    const updated = await records(await json('PATCH', '', { records: [{ id: alice!.id, fields: { role: 'admin' } }, { id: bob!.id, fields: { role: 'member' } }] }))
    assert.deepEqual(updated.map((record) => record.fields), [{ name: 'Alice', role: 'admin' }, { name: 'Bob', role: 'member' }])
    const replaced = await records(await json('PUT', '', { records: [{ id: alice!.id, fields: { name: 'Alice Smith' } }] }))
    assert.deepEqual(replaced[0]!.fields, { name: 'Alice Smith' })
    const deleted = await records(await json('DELETE', '', { ids: [alice!.id, bob!.id] }))
    assert.deepEqual(deleted.map((record) => record.id).sort(), [alice!.id, bob!.id].sort())
    assert.deepEqual(stored(), [])
  })

  it('writes nothing in a batch that has one unknown id', async () => {
    const { gateway, json, stored } = conduit()
    const [alice] = gateway.sheets.seed(gateway.suriObjectKey, [{ name: 'Alice', role: 'member' }])

    assert.equal((await json('PATCH', '', { records: [{ id: alice!.id, fields: { role: 'admin' } }, { id: 'missing', fields: { role: 'admin' } }] })).status, 404)
    assert.equal((await json('PUT', '', { records: [{ id: alice!.id, fields: { name: 'Alice Smith' } }, { id: 'missing', fields: { name: 'Nobody' } }] })).status, 404)
    assert.equal((await json('DELETE', '', { ids: [alice!.id, 'missing'] })).status, 404)
    assert.deepEqual(stored(), [{ name: 'Alice', role: 'member' }])
  })

  it('writes nothing in a bulk create that has one unknown field', async () => {
    const { json, stored } = conduit({ suriConfig: { fieldMap: { name: 'name' } } })
    assert.equal((await json('POST', '', { records: [{ fields: { name: 'Ada' } }, { fields: { name: 'Grace', phone: '555-0100' } }] })).status, 400)
    assert.deepEqual(stored(), [])
  })
})

describe('hidden form fields', () => {
  it('answers a filled honeypot like a create, with an id and without the field, and stores nothing', async () => {
    const { json, stored } = conduit(HONEYPOT)
    const response = await json('POST', '', { fields: { name: 'A Bot', website: 'https://spam.example' } })
    assert.equal(response.status, 201)
    const body = (await response.json()) as { id: string; fields: Record<string, unknown> }
    assert.ok(body.id)
    assert.equal(body.fields.website, undefined)
    assert.deepEqual(stored(), [])
  })

  it('stores the records of a bulk create the honeypot lets through, and answers for all of them', async () => {
    const { json, stored } = conduit(HONEYPOT)
    const response = await json('POST', '', { records: [{ fields: { name: 'Real Person' } }, { fields: { name: 'Bot', website: 'https://spam.example' } }] })
    assert.equal(response.status, 201)
    assert.equal(((await response.json()) as { records: unknown[] }).records.length, 2)
    assert.deepEqual(stored(), [{ name: 'Real Person' }])
  })

  it('drops a create whose pass-if-match value is wrong like a honeypot, and stores a right one only when include is true', async () => {
    const { json, stored } = conduit({
      hiddenFormField: [
        { fieldName: 'campaign', policy: 'pass-if-match', value: 'spring-2026', include: true },
        { fieldName: 'formVersion', policy: 'pass-if-match', value: 'v2', include: false },
      ],
    })
    const wrong = await json('POST', '', { fields: { name: 'Bot', campaign: 'wrong', formVersion: 'v2' } })
    assert.equal(wrong.status, 201)
    assert.equal(((await wrong.json()) as { fields: Record<string, unknown> }).fields.campaign, undefined)
    assert.deepEqual(stored(), [])

    const right = await json('POST', '', { fields: { name: 'Ada', campaign: 'spring-2026', formVersion: 'v2' } })
    assert.deepEqual(((await right.json()) as { fields: Record<string, unknown> }).fields, { name: 'Ada', campaign: 'spring-2026' })
    assert.deepEqual(stored(), [{ name: 'Ada', campaign: 'spring-2026' }])
  })

  it('applies only to a create: an update writes the field through', async () => {
    const { gateway, json } = conduit(HONEYPOT)
    const [ada] = gateway.sheets.seed(gateway.suriObjectKey, [{ name: 'Ada', website: '' }])
    const updated = await json('PATCH', `/${ada!.id}`, { fields: { website: 'https://spam.example' } })
    assert.equal(updated.status, 200)
    assert.equal(((await updated.json()) as { fields: Record<string, unknown> }).fields.website, 'https://spam.example')
  })
})
