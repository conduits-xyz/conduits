import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { toSourceFields, toWidgetFields, checkKnownFields, ConduitUnknownFieldError } from '../field-map.ts'

describe('field-map', () => {
  describe('toSourceFields/toWidgetFields', () => {
    it('translates by fieldMap, passing through any name absent from it unchanged', () => {
      const fieldMap = { name: 'Full Name' }
      assert.deepEqual(toSourceFields({ name: 'Ada', email: 'ada@example.com' }, fieldMap), {
        'Full Name': 'Ada',
        email: 'ada@example.com',
      })
      assert.deepEqual(toWidgetFields({ 'Full Name': 'Ada', email: 'ada@example.com' }, fieldMap), {
        name: 'Ada',
        email: 'ada@example.com',
      })
    })

    it('is a total no-op when fieldMap is undefined', () => {
      const fields = { name: 'Ada' }
      assert.equal(toSourceFields(fields, undefined), fields)
      assert.equal(toWidgetFields(fields, undefined), fields)
    })
  })

  describe('checkKnownFields', () => {
    it('accepts anything when fieldMap is undefined or empty — no schema declared at all', () => {
      // No throw is the assertion — a real one would fail this test on
      // its own, same as any other unexpectedly-thrown error.
      checkKnownFields({ anything: 'x', goes: 'y' }, undefined, 'gmail')
      checkKnownFields({ anything: 'x' }, {}, 'gmail')
    })

    it('rejects a field outside a declared, non-empty schema — for every suri_type alike, not just Sheets', () => {
      const fieldMap = { name: 'name', email: 'email' }
      checkKnownFields({ name: 'Ada', email: 'ada@example.com' }, fieldMap, 'gmail') // every declared field: no throw
      assert.throws(() => checkKnownFields({ name: 'Ada', phone: '555-0100' }, fieldMap, 'gmail'), ConduitUnknownFieldError)
      assert.throws(() => checkKnownFields({ name: 'Ada', phone: '555-0100' }, fieldMap, 'fastmail'), ConduitUnknownFieldError)
    })

    it('carries the offending field name and the given source on the thrown error', () => {
      assert.throws(
        () => checkKnownFields({ phone: '555-0100' }, { name: 'name' }, 'gmail'),
        (err: unknown) => err instanceof ConduitUnknownFieldError && err.fieldName === 'phone' && err.source === 'gmail' && /'phone'/.test(err.message),
      )
    })
  })
})
