import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { fieldDefinitionProblems, valueProblems } from '../field-schema.ts'

describe('field definitions', () => {
  it('accepts a type, and a choice field with distinct, trimmed options without commas', () => {
    assert.deepEqual(fieldDefinitionProblems({ type: 'email' }), [])
    assert.deepEqual(fieldDefinitionProblems({ type: 'single_select', options: ['Small (6 inch)', 'Large'] }), [])
    assert.deepEqual(fieldDefinitionProblems({ type: 'multi_select', options: ['Lemon', 'Vanilla'] }), [])
  })

  it('names what is wrong', () => {
    assert.match(fieldDefinitionProblems({ type: 'checkbox' })[0]!, /^type must be one of text, textarea/)
    assert.deepEqual(fieldDefinitionProblems({ type: 'text', options: ['A'] }), ['only single_select and multi_select take options'])
    assert.deepEqual(fieldDefinitionProblems({ type: 'single_select', options: [] }), ['needs at least one option'])
    assert.deepEqual(fieldDefinitionProblems({ type: 'multi_select', options: ['Vanilla', 'vanilla', ' Lemon', 'Salted, caramel'] }), [
      "option 'vanilla' is listed twice",
      "option ' Lemon' has spaces at its start or end",
      "option 'Salted, caramel' contains a comma, which an option can't",
    ])
  })
})

describe('values', () => {
  it('takes the email addresses and dates a browser form takes', () => {
    const fields = { email: { type: 'email' as const }, day: { type: 'date' as const } }
    assert.deepEqual(valueProblems({ email: 'ada.lovelace+notes@example.co.uk', day: '2024-02-29' }, fields), [])
    assert.equal(valueProblems({ email: 'ada@', day: '2023-02-29' }, fields).length, 2)
  })
})
