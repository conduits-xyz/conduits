import * as assert from 'remix/assert'
import { describe, it, beforeEach } from 'remix/test'

import { googleSheetsClient, resetFakeSheets, seedFakeSheet, ID_COLUMN_NAME } from '../index.ts'

describe('ConduitTable.createField/createFields (schema editor)', () => {
  beforeEach(() => {
    resetFakeSheets()
  })

  it('creates several fields at once on a genuinely blank sheet — no seedFakeSheet call at all', async () => {
    const sourceKey = 'sheet-blank'
    const source = await googleSheetsClient.connect(sourceKey, 'unused')
    const table = source.open()

    await table.createFields([{ name: 'email' }, { name: 'name' }])

    const fields = await table.describeFields()
    assert.deepEqual(
      fields.map((f) => f.name).sort(),
      ['email', 'name'],
    )
  })

  it('createField (singular) is a thin wrapper around createFields', async () => {
    const sourceKey = 'sheet-singular'
    const source = await googleSheetsClient.connect(sourceKey, 'unused')
    const table = source.open()

    await table.createField('subject')

    const fields = await table.describeFields()
    assert.deepEqual(fields.map((f) => f.name), ['subject'])
  })

  it('is idempotent — creating a field that already exists is a no-op, not an error', async () => {
    const sourceKey = 'sheet-idempotent'
    const source = await googleSheetsClient.connect(sourceKey, 'unused')
    const table = source.open()

    seedFakeSheet(sourceKey, [{ email: 'seed@example.com' }])
    await table.createFields([{ name: 'email' }, { name: 'phone' }])

    const fields = await table.describeFields()
    assert.deepEqual(
      fields.map((f) => f.name).sort(),
      ['email', 'phone'],
    )
  })

  it('refuses to create a field named after the reserved id column', async () => {
    const sourceKey = 'sheet-reserved'
    const source = await googleSheetsClient.connect(sourceKey, 'unused')
    const table = source.open()

    await assert.rejects(() => table.createField(ID_COLUMN_NAME))
  })
})
