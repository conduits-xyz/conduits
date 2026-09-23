import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { wantsHtml } from '../content-negotiation.ts'

describe('wantsHtml', () => {
  it('is false for a missing Accept header', () => {
    assert.equal(wantsHtml(null), false)
  })

  it('is false for Accept: */*', () => {
    assert.equal(wantsHtml('*/*'), false)
  })

  it('is true for a real browser navigation Accept header', () => {
    assert.equal(wantsHtml('text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'), true)
  })

  it('is false for a bare curl-style call (no Accept sent) and for an explicit application/json', () => {
    assert.equal(wantsHtml('application/json'), false)
  })

  it('is false when json is explicitly preferred at a higher quality than html', () => {
    assert.equal(wantsHtml('text/html;q=0.5, application/json;q=0.9'), false)
  })

  it('is true when html is explicitly preferred at a higher quality than json', () => {
    assert.equal(wantsHtml('text/html;q=0.9, application/json;q=0.5'), true)
  })

  it('is false when html and json tie exactly (same specificity, same quality)', () => {
    assert.equal(wantsHtml('text/html;q=0.5, application/json;q=0.5'), false)
  })

  it('is true when html matches specifically and json only matches a lower-quality wildcard', () => {
    assert.equal(wantsHtml('text/html, */*;q=0.1'), true)
  })

  it('is false when neither text/html nor a wildcard is present', () => {
    assert.equal(wantsHtml('application/xml'), false)
  })

  it('is true for a bare "text/html" with no other ranges at all', () => {
    assert.equal(wantsHtml('text/html'), true)
  })

  it('is true for text/* even with no explicit json range (an explicit non-JSON preference)', () => {
    assert.equal(wantsHtml('text/*'), true)
  })

  it('ignores a zero-quality text/html range', () => {
    assert.equal(wantsHtml('text/html;q=0, */*'), false)
  })
})
