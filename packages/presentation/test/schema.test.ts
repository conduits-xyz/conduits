import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { PageSpecSchema, PageSpecV1Schema, WidgetSpecSchema, firstWidget } from '../schema.ts'

const validForm = {
  version: 1 as const,
  blocks: [
    {
      title: 'Saturday Orders',
      description: 'Place your order by Friday.',
      widgets: [{ type: 'xyz-form' as const, props: { fields: [{ name: 'flavor', type: 'text' as const }] } }],
    },
  ],
}

const validTable = {
  version: 1 as const,
  blocks: [
    {
      widgets: [{ type: 'xyz-table' as const, props: { columns: [{ field: 'flavor' }] } }],
    },
  ],
}

describe('PageSpecSchema', () => {
  it('accepts a valid xyz-form page', () => {
    assert.equal(PageSpecSchema.safeParse(validForm).success, true)
  })

  it('accepts a valid xyz-table page', () => {
    assert.equal(PageSpecSchema.safeParse(validTable).success, true)
  })

  it('rejects a version other than 1', () => {
    assert.equal(PageSpecSchema.safeParse({ ...validForm, version: 2 }).success, false)
  })

  it('rejects a page with no blocks', () => {
    assert.equal(PageSpecSchema.safeParse({ version: 1, blocks: [] }).success, false)
  })

  it('accepts more than one block — the general shape is not itself cardinality-limited', () => {
    const twoBlocks = { version: 1, blocks: [validForm.blocks[0], validForm.blocks[0]] }
    assert.equal(PageSpecSchema.safeParse(twoBlocks).success, true)
  })
})

describe('PageSpecV1Schema', () => {
  it('accepts exactly one block with exactly one widget', () => {
    assert.equal(PageSpecV1Schema.safeParse(validForm).success, true)
  })

  it('rejects more than one block', () => {
    const twoBlocks = { version: 1, blocks: [validForm.blocks[0], validForm.blocks[0]] }
    assert.equal(PageSpecV1Schema.safeParse(twoBlocks).success, false)
  })

  it('rejects more than one widget in the single block', () => {
    const twoWidgets = {
      version: 1,
      blocks: [{ ...validForm.blocks[0], widgets: [validForm.blocks[0].widgets[0], validTable.blocks[0].widgets[0]] }],
    }
    assert.equal(PageSpecV1Schema.safeParse(twoWidgets).success, false)
  })
})

describe('WidgetSpecSchema', () => {
  it('rejects an unknown widget type', () => {
    const result = WidgetSpecSchema.safeParse({ type: 'xyz-carousel', props: {} })
    assert.equal(result.success, false)
  })

  it('rejects a named future widget before it is actually implemented', () => {
    // xyz-picker/xyz-uploader/xyz-calendar/xyz-payment are the named
    // long-term catalog direction (see README.md) but are explicitly
    // out of scope for this version — the union must not accept them
    // just because the name is known.
    for (const type of ['xyz-picker', 'xyz-uploader', 'xyz-calendar', 'xyz-payment']) {
      assert.equal(WidgetSpecSchema.safeParse({ type, props: {} }).success, false)
    }
  })

  it('rejects xyz-form props missing at least one field', () => {
    assert.equal(WidgetSpecSchema.safeParse({ type: 'xyz-form', props: { fields: [] } }).success, false)
  })

  it('rejects xyz-table props missing at least one column', () => {
    assert.equal(WidgetSpecSchema.safeParse({ type: 'xyz-table', props: { columns: [] } }).success, false)
  })
})

describe('firstWidget', () => {
  it('returns the single widget of a v1-shaped page', () => {
    const parsed = PageSpecV1Schema.parse(validForm)
    assert.equal(firstWidget(parsed).type, 'xyz-form')
  })
})
