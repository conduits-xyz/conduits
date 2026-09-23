import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { PageSpecV1Schema } from '../schema.ts'
import { escapeHtml, renderHostedPage, renderHostedFailurePage } from '../render.ts'

const formPage = PageSpecV1Schema.parse({
  version: 1,
  blocks: [
    {
      title: 'Saturday Orders',
      description: 'Place your order by Friday.',
      widgets: [{ type: 'xyz-form', props: { fields: [{ name: 'flavor', label: 'Flavor', required: true }] }, }],
    },
  ],
})

const tablePage = PageSpecV1Schema.parse({
  version: 1,
  blocks: [{ widgets: [{ type: 'xyz-table', props: { columns: [{ field: 'flavor', label: 'Flavor' }] } }] }],
})

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    assert.equal(escapeHtml(`<script>alert('x')</script> & "quoted"`), '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quoted&quot;')
  })

  it('stringifies non-string values', () => {
    assert.equal(escapeHtml(42), '42')
    assert.equal(escapeHtml(null), '')
    assert.equal(escapeHtml(undefined), '')
  })
})

describe('renderHostedPage — xyz-form', () => {
  it('renders exactly one Block and one Widget', () => {
    const html = renderHostedPage(formPage, { curi: 'orders' })
    // One <xyz-form>...</xyz-form> and no <xyz-table> at all.
    assert.equal((html.match(/<xyz-form>/g) ?? []).length, 1)
    assert.equal((html.match(/<xyz-table>/g) ?? []).length, 0)
    assert.match(html, /Saturday Orders/)
    assert.match(html, /Place your order by Friday\./)
  })

  it('renders a real native form that submits to the same curi', () => {
    const html = renderHostedPage(formPage, { curi: 'orders' })
    assert.match(html, /<form method="post" action="" enctype="application\/x-www-form-urlencoded">/)
    assert.match(html, /enctype="application\/x-www-form-urlencoded"/)
    assert.match(html, /name="_redirect" value="\/orders\?submitted=1"/)
    assert.match(html, /name="flavor"/)
    assert.match(html, /required/)
  })

  it('escapes untrusted block/field content', () => {
    const evil = PageSpecV1Schema.parse({
      version: 1,
      blocks: [{ title: '<script>1</script>', widgets: formPage.blocks[0].widgets }],
    })
    const html = renderHostedPage(evil, { curi: 'orders' })
    assert.doesNotMatch(html, /<script>1<\/script>/)
    assert.match(html, /&lt;script&gt;1&lt;\/script&gt;/)
  })

  it('shows a success state instead of the form once submitted', () => {
    const html = renderHostedPage(formPage, { curi: 'orders', submitted: true })
    assert.doesNotMatch(html, /<form/)
    assert.match(html, /xyz-success/)
    assert.match(html, /Thanks — your submission was received\./)
  })

  it('uses a configured success message when present', () => {
    const withMessage = PageSpecV1Schema.parse({
      version: 1,
      blocks: [
        {
          widgets: [{ type: 'xyz-form', props: { fields: [{ name: 'flavor' }], successMessage: 'Order received!' } }],
        },
      ],
    })
    const html = renderHostedPage(withMessage, { curi: 'orders', submitted: true })
    assert.match(html, /Order received!/)
  })
})

describe('renderHostedPage — xyz-table', () => {
  it('renders exactly one Block and one Widget', () => {
    const html = renderHostedPage(tablePage, { curi: 'orders', table: { rows: [] } })
    assert.equal((html.match(/<xyz-table>/g) ?? []).length, 1)
    assert.equal((html.match(/<xyz-form>/g) ?? []).length, 0)
  })

  it('renders real conduit rows into the table body', () => {
    const html = renderHostedPage(tablePage, { curi: 'orders', table: { rows: [{ flavor: 'Vanilla' }, { flavor: 'Chocolate' }] } })
    assert.match(html, /Vanilla/)
    assert.match(html, /Chocolate/)
  })

  it('shows the empty-state message when there are no rows', () => {
    const html = renderHostedPage(tablePage, { curi: 'orders', table: { rows: [] } })
    assert.match(html, /No records yet\./)
  })

  it('escapes untrusted row data', () => {
    const html = renderHostedPage(tablePage, { curi: 'orders', table: { rows: [{ flavor: '<img src=x onerror=alert(1)>' }] } })
    assert.doesNotMatch(html, /<img src=x/)
    assert.match(html, /&lt;img/)
  })

  it('renders a next-page link only when a cursor is present', () => {
    // The default stylesheet itself declares a `.xyz-table-nav` CSS
    // rule regardless of page content, so the check has to look for the
    // actual rendered element, not the bare class name.
    const withoutCursor = renderHostedPage(tablePage, { curi: 'orders', table: { rows: [{ flavor: 'Vanilla' }] } })
    assert.doesNotMatch(withoutCursor, /<div class="xyz-table-nav">/)

    const withCursor = renderHostedPage(tablePage, { curi: 'orders', table: { rows: [{ flavor: 'Vanilla' }], nextCursor: 'abc' } })
    assert.match(withCursor, /<div class="xyz-table-nav">/)
    assert.match(withCursor, /href="\?cursor=abc"/)
  })
})

describe('renderHostedFailurePage', () => {
  it('never includes raw JSON — a plain, generic human-readable failure', () => {
    const html = renderHostedFailurePage(formPage, { curi: 'orders' })
    assert.doesNotMatch(html, /\{"error"/)
    assert.match(html, /Something went wrong/)
    assert.match(html, /href="\/orders"/)
  })
})
