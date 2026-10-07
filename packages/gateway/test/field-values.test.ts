import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import type { FieldSchemas } from '@conduits/conduit'

import { createFakeGateway } from './fake-gateway.ts'

// The conduit's fields (field-schema.ts in @conduits/conduit) through
// dispatch: a value that doesn't fit its field is refused before the
// source is opened; every value read back is typed by its field.

const FLAVORS = ['Chocolate', 'Vanilla', 'Lemon']
const FIELDS: FieldSchemas = {
  name: { type: 'text' },
  email: { type: 'email' },
  site: { type: 'url' },
  guests: { type: 'number' },
  day: { type: 'date' },
  zip: { type: 'text' },
  cake: { type: 'single_select', options: ['Birthday cake', 'Wedding cake'] },
  flavors: { type: 'multi_select', options: FLAVORS },
}

function setup(fields: FieldSchemas = FIELDS) {
  const curi = `fields-${Math.random().toString(36).slice(2)}`
  const gateway = createFakeGateway(curi)
  const router = gateway.makeRouter(gateway.baseConfig({ racm: ['GET', 'POST', 'PATCH'], fields }))
  const send = (method: string, path: string, body: unknown, contentType = 'application/json') =>
    router.fetch(
      new Request(`http://localhost/${curi}${path}`, {
        method,
        headers: { 'content-type': contentType },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
    )
  const list = async () =>
    ((await (await router.fetch(new Request(`http://localhost/${curi}`))).json()) as { records: { id: string; fields: Record<string, unknown> }[] }).records
  return { gateway, router, curi, send, list }
}

type Problem = { code: string; detail: string; errors: { code: string; field: string; pointer: string; detail: string }[] }

const ALL_EMPTY = { name: null, email: null, site: null, guests: null, day: null, zip: null, cake: null, flavors: [] }

describe('field values', () => {
  it('stores each value as sent and reads it back typed by its field', async () => {
    const { gateway, send, list } = setup()
    const fields = { name: 'Ada', email: 'ada@example.com', site: 'https://ada.example', guests: 12, day: '2026-01-31', zip: '01234', cake: 'Wedding cake', flavors: ['Chocolate', 'Lemon'] }
    const created = await send('POST', '', { fields })
    assert.equal(created.status, 201)
    assert.deepEqual(((await created.json()) as { fields: unknown }).fields, fields)
    assert.deepEqual(gateway.sheets.records(gateway.suriObjectKey)[0]!.fields, { ...fields, flavors: 'Chocolate, Lemon' })
    assert.deepEqual((await list())[0]!.fields, fields)
  })

  it('reads a value typed into the sheet by hand by its field, and one that does not fit as text', async () => {
    const { gateway, list } = setup()
    gateway.sheets.seed(gateway.suriObjectKey, [
      { ...ALL_EMPTY, flavors: null, guests: '7', zip: 2000 },
      { ...ALL_EMPTY, flavors: null, guests: 'about ten', zip: null },
    ])
    const [first, second] = await list()
    assert.deepEqual([first!.fields.guests, first!.fields.zip], [7, '2000'])
    assert.equal(second!.fields.guests, 'about ten')
  })

  it('takes null, an empty string or an empty list as no value, stored empty and read back as null', async () => {
    const { gateway, send, list } = setup()
    const created = await send('POST', '', { fields: { name: '', email: null, guests: '', day: null, cake: '', flavors: [] } })
    assert.equal(created.status, 201)
    assert.deepEqual(Object.values(gateway.sheets.records(gateway.suriObjectKey)[0]!.fields), [null, null, null, null, null, null])
    assert.deepEqual((await list())[0]!.fields, { name: null, email: null, guests: null, day: null, cake: null, flavors: [] })
  })

  it('refuses values that do not fit their fields, each with a pointer, and never opens the source', async () => {
    const { gateway, send } = setup()
    const response = await send('POST', '', {
      fields: { name: 5, email: 'not an email', site: 'ada.example', guests: '12', day: '2026-02-30', cake: 'Pie', flavors: ['Lemon', 'Mint'] },
    })
    assert.equal(response.status, 400)
    const body = (await response.json()) as Problem
    assert.equal(body.code, 'invalid_value')
    assert.deepEqual(
      body.errors.map((error) => [error.pointer, error.detail]),
      [
        ['/fields/name', 'name must be text.'],
        ['/fields/email', 'email must be an email address.'],
        ['/fields/site', 'site must be a web address starting with http:// or https://.'],
        ['/fields/guests', 'guests must be a number.'],
        ['/fields/day', 'day must be a date written YYYY-MM-DD.'],
        ['/fields/cake', 'cake must be one of: Birthday cake, Wedding cake.'],
        ['/fields/flavors', 'flavors has Mint, not among: Chocolate, Vanilla, Lemon.'],
      ],
    )
    assert.equal(gateway.sheets.records(gateway.suriObjectKey).length, 0)
  })

  it('refuses a multi_select value that is not a list or lists an option twice, and a list sent to any other field', async () => {
    const { send } = setup()
    const detail = async (fields: object) => ((await (await send('POST', '', { fields })).json()) as Problem).errors[0]!.detail
    assert.equal(await detail({ flavors: 'Lemon' }), 'flavors must be a list of options.')
    assert.equal(await detail({ flavors: ['Lemon', 'Lemon'] }), 'flavors lists Lemon twice.')
    assert.equal(await detail({ name: ['Ada'] }), 'name must be text.')
  })

  it('points into the records of a bulk write, and checks an update too', async () => {
    const { send } = setup()
    const bulk = (await (await send('POST', '', { records: [{ fields: { guests: 2 } }, { fields: { guests: 'two' } }] })).json()) as Problem
    assert.deepEqual(bulk.errors.map((error) => error.pointer), ['/records/1/fields/guests'])

    const created = (await (await send('POST', '', { fields: { ...ALL_EMPTY, name: 'Ada' } })).json()) as { id: string }
    assert.equal((await send('PATCH', `/${created.id}`, { fields: { guests: 'two' } })).status, 400)
    const updated = await send('PATCH', `/${created.id}`, { fields: { flavors: ['Vanilla'] } })
    assert.deepEqual(((await updated.json()) as { fields: Record<string, unknown> }).fields.flavors, ['Vanilla'])
  })

  it('reads a plain HTML form by its fields: numbers from their text, one ticked box or several as a list', async () => {
    const { send } = setup({ name: { type: 'text' }, guests: { type: 'number' }, flavors: { type: 'multi_select', options: FLAVORS } })
    const form = (body: string) => send('POST', '', body, 'application/x-www-form-urlencoded')
    const several = await form('name=Ada&guests=12&flavors=Chocolate&flavors=Vanilla')
    assert.equal(several.status, 201)
    assert.deepEqual(((await several.json()) as { fields: unknown }).fields, { name: 'Ada', guests: 12, flavors: ['Chocolate', 'Vanilla'] })
    const one = await form('name=Grace&guests=&flavors=Lemon')
    assert.deepEqual(((await one.json()) as { fields: unknown }).fields, { name: 'Grace', guests: null, flavors: ['Lemon'] })
    assert.equal((await form('name=Edsger&guests=a+dozen')).status, 400)
    // JSON is taken as sent.
    assert.equal((await send('POST', '', { fields: { guests: '12' } })).status, 400)
  })

  it('passes values as they are for a conduit that declares no fields, but never a list', async () => {
    const { send } = setup({})
    const created = await send('POST', '', { fields: { name: 'Ada', guests: 3 } })
    assert.deepEqual(((await created.json()) as { fields: unknown }).fields, { name: 'Ada', guests: 3 })
    assert.equal((await send('POST', '', { fields: { name: ['Ada'] } })).status, 400)
  })
})
