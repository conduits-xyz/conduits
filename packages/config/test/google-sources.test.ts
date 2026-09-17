import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { compileConduits } from '../compile.ts'
import { GOOGLE_SHEETS_SCOPES, GMAIL_SCOPES } from '../google-scopes.ts'

const GOOGLE_SUPPORTED = { supportedSourceTypes: ['googleSheets', 'gmail'] }

describe('compileConduits — googleSheets', () => {
  it('compiles a minimal googleSheets conduit, credentialRef staying the opaque google: reference', () => {
    const yaml = `
conduits:
  newsletter:
    curi: newsletter
    methods: [POST, GET]
    source:
      type: googleSheets
      credential: google:personal
      spreadsheetId: 1AbCSpreadsheetId
`
    const { configs: [config] } = compileConduits(yaml, GOOGLE_SUPPORTED)
    assert.equal(config?.suriType, 'googleSheets')
    assert.equal(config?.suriObjectKey, '1AbCSpreadsheetId')
    assert.equal(config?.credentialRef, 'google:personal')
    assert.deepEqual(config?.suriConfig, { table: undefined, fieldMap: undefined })
  })

  it('compiles optional sheet/fieldMap into suriConfig', () => {
    const yaml = `
conduits:
  newsletter:
    curi: newsletter
    methods: [POST]
    source:
      type: googleSheets
      credential: google:personal
      spreadsheetId: 1AbC
      sheet: Responses
      fieldMap:
        fullName: Name
`
    const { configs: [config] } = compileConduits(yaml, GOOGLE_SUPPORTED)
    assert.deepEqual(config?.suriConfig, { table: 'Responses', fieldMap: { fullName: 'Name' } })
  })

  it('rejects a credential that is not a google: reference (e.g. an env: one)', () => {
    const yaml = `
conduits:
  newsletter:
    curi: newsletter
    methods: [POST]
    source:
      type: googleSheets
      credential: env:SOME_TOKEN
      spreadsheetId: 1AbC
`
    assert.throws(() => compileConduits(yaml, GOOGLE_SUPPORTED), /expected "google:<name>"/)
  })

  it('rejects a missing spreadsheetId', () => {
    const yaml = `
conduits:
  newsletter:
    curi: newsletter
    methods: [POST]
    source:
      type: googleSheets
      credential: google:personal
`
    assert.throws(() => compileConduits(yaml, GOOGLE_SUPPORTED), /source.spreadsheetId is required/)
  })

  it('rejects a fieldMap with a non-string value', () => {
    const yaml = `
conduits:
  newsletter:
    curi: newsletter
    methods: [POST]
    source:
      type: googleSheets
      credential: google:personal
      spreadsheetId: 1AbC
      fieldMap:
        fullName: 42
`
    assert.throws(() => compileConduits(yaml, GOOGLE_SUPPORTED), /source.fieldMap.fullName must be a string/)
  })
})

describe('compileConduits — gmail', () => {
  it('compiles a minimal gmail conduit — no identityId, unlike fastmail', () => {
    const yaml = `
conduits:
  contact-form:
    curi: contact-form
    methods: [POST]
    source:
      type: gmail
      credential: google:personal
      recipients: [owner@example.com]
      subject: New submission
`
    const { configs: [config] } = compileConduits(yaml, GOOGLE_SUPPORTED)
    assert.equal(config?.suriType, 'gmail')
    assert.equal(config?.suriObjectKey, '')
    assert.equal(config?.credentialRef, 'google:personal')
    assert.deepEqual(config?.suriConfig, { recipients: ['owner@example.com'], subject: 'New submission' })
  })

  it('rejects a missing recipients', () => {
    const yaml = `
conduits:
  contact-form:
    curi: contact-form
    methods: [POST]
    source:
      type: gmail
      credential: google:personal
      subject: New submission
`
    assert.throws(() => compileConduits(yaml, GOOGLE_SUPPORTED), /source.recipients must be a non-empty list/)
  })
})

describe('a config naming a Google source type this runtime does not list as supported', () => {
  it('fails at compile time, not the first live request', () => {
    const yaml = `
conduits:
  newsletter:
    curi: newsletter
    methods: [POST]
    source:
      type: googleSheets
      credential: google:personal
      spreadsheetId: 1AbC
`
    assert.throws(
      () => compileConduits(yaml, { supportedSourceTypes: ['fastmail'] }),
      /source type 'googleSheets' is not supported by this gateway/,
    )
  })
})

describe('Google scope constants', () => {
  it('exposes the exact scope lists any consuming runtime\'s OAuth flow relies on — frozen here so a future edit is a visible diff, not a silent drift', () => {
    assert.deepEqual(GOOGLE_SHEETS_SCOPES, ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'])
    assert.deepEqual(GMAIL_SCOPES, ['https://www.googleapis.com/auth/gmail.send', 'openid', 'email'])
  })
})
