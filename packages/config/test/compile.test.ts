import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { compileConduits } from '../compile.ts'
import { verifyBearerToken } from '@conduits/gateway'

const FASTMAIL_ONLY = { supportedSourceTypes: ['fastmail'] }

function baseYaml(overrides = ''): string {
  return `
conduits:
  contact-form:
    methods: [POST]
    source:
      type: fastmail
      identityId: ident-1
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: New submission
${overrides}
`
}

describe('compileConduits', () => {
  it('compiles a minimal fastmail conduit, defaulting throttle/allowlist/hiddenFormField', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    const [config] = compileConduits(baseYaml(), FASTMAIL_ONLY)
    assert.equal(config?.curi, 'contact-form')
    assert.deepEqual(config?.racm, ['POST'])
    assert.equal(config?.throttle, true)
    assert.deepEqual(config?.allowlist, [])
    assert.deepEqual(config?.tokenRequiredMethods, [])
    assert.equal(config?.bearerTokenHash, null)
    assert.deepEqual(config?.hiddenFormField, [])
    assert.equal(config?.suriType, 'fastmail')
    assert.equal(config?.suriObjectKey, 'ident-1')
    assert.deepEqual(config?.suriConfig, { recipients: ['owner@example.com'], subject: 'New submission', table: undefined })
  })

  it('never resolves the credential env var into ConduitConfig — credentialRef stays the opaque reference', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    const [config] = compileConduits(baseYaml(), FASTMAIL_ONLY)
    assert.equal(config?.credentialRef, 'env:FASTMAIL_TOKEN')
  })

  it('secrets do not enter ConduitConfig: the resolved provider credential and the bearer plaintext are both absent from the whole serialized config, only the credential reference and the bearer hash survive', () => {
    process.env.FASTMAIL_TOKEN = 'super-secret-fastmail-value-xyz123'
    process.env.CONTACT_FORM_TOKEN = 'super-secret-bearer-plaintext-abc789'

    const [config] = compileConduits(
      baseYaml(`
    bearerToken:
      value: env:CONTACT_FORM_TOKEN
      requiredFor: [POST]
`),
      FASTMAIL_ONLY,
    )
    assert.ok(config)

    // Simulates the real risk: this config being logged, persisted, or
    // otherwise serialized somewhere — neither secret's plaintext may
    // survive that round trip.
    const serialized = JSON.stringify(config)

    assert.ok(!serialized.includes('super-secret-fastmail-value-xyz123'), 'resolved provider credential must not appear in serialized ConduitConfig')
    assert.ok(!serialized.includes('super-secret-bearer-plaintext-abc789'), 'bearer plaintext must not appear in serialized ConduitConfig')

    // What *should* be there instead: the opaque reference, and the hash.
    assert.ok(serialized.includes('env:FASTMAIL_TOKEN'), 'credentialRef itself (the reference, not the value) should still be present')
    assert.ok(config!.bearerTokenHash && serialized.includes(config!.bearerTokenHash), 'bearerTokenHash should still be present')
  })

  it('fails startup if the credential env var is not set', () => {
    delete process.env.FASTMAIL_TOKEN
    assert.throws(() => compileConduits(baseYaml(), FASTMAIL_ONLY), /FASTMAIL_TOKEN is not set/)
  })

  it('resolves bearerToken.value only long enough to hash it — the hash, not the plaintext, reaches ConduitConfig', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    process.env.CONTACT_FORM_TOKEN = 'bearer-plaintext'
    const [config] = compileConduits(
      baseYaml(`
    bearerToken:
      value: env:CONTACT_FORM_TOKEN
      requiredFor: [POST]
`),
      FASTMAIL_ONLY,
    )
    assert.ok(config?.bearerTokenHash)
    assert.notEqual(config?.bearerTokenHash, 'bearer-plaintext')
    assert.ok(verifyBearerToken('bearer-plaintext', config!.bearerTokenHash!))
    assert.deepEqual(config?.tokenRequiredMethods, ['POST'])
  })

  it('rejects bearerToken.requiredFor listing a method not present in methods', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    process.env.CONTACT_FORM_TOKEN = 'bearer-plaintext'
    assert.throws(
      () =>
        compileConduits(
          baseYaml(`
    bearerToken:
      value: env:CONTACT_FORM_TOKEN
      requiredFor: [GET]
`),
          FASTMAIL_ONLY,
        ),
      /requiredFor lists \["GET"\], not present in methods \["POST"\]/,
    )
  })

  it('rejects a duplicate curi as a YAML parse error, not a silent overwrite', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    const yaml = `
conduits:
  contact-form:
    methods: [POST]
    source: { type: fastmail, identityId: ident-1, credential: env:FASTMAIL_TOKEN, recipients: [a@example.com], subject: hi }
  contact-form:
    methods: [GET]
    source: { type: fastmail, identityId: ident-2, credential: env:FASTMAIL_TOKEN, recipients: [b@example.com], subject: bye }
`
    assert.throws(() => compileConduits(yaml, FASTMAIL_ONLY), /Map keys must be unique/)
  })

  it('fails startup for a source type this runtime does not support, rather than deferring to the first request', () => {
    process.env.SHEET_CREDENTIAL = 'unused'
    const yaml = `
conduits:
  newsletter:
    methods: [POST]
    source:
      type: googleSheets
`
    assert.throws(() => compileConduits(yaml, FASTMAIL_ONLY), /source type 'googleSheets' is not supported by this gateway/)
  })

  it('compiles honeypot and mustEqual hidden-field policies to the real HiddenFormFieldRule shape', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    const [config] = compileConduits(
      baseYaml(`
    hiddenFields:
      - name: website
        policy: honeypot
      - name: formVersion
        policy: mustEqual
        value: v2
        forward: true
`),
      FASTMAIL_ONLY,
    )
    assert.deepEqual(config?.hiddenFormField, [
      { fieldName: 'website', policy: 'drop-if-filled' },
      { fieldName: 'formVersion', policy: 'pass-if-match', value: 'v2', include: true },
    ])
  })

  it('compiles a bare-string and an {ip, comment} allowlist entry, always as status active', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    const [config] = compileConduits(
      baseYaml(`
    allowlist:
      - 203.0.113.4
      - ip: 203.0.113.9
        comment: office network
`),
      FASTMAIL_ONLY,
    )
    assert.deepEqual(config?.allowlist, [
      { ip: '203.0.113.4', status: 'active' },
      { ip: '203.0.113.9', comment: 'office network', status: 'active' },
    ])
  })

  it('rejects methods missing entirely — no implicit default', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    const yaml = `
conduits:
  contact-form:
    source:
      type: fastmail
      identityId: ident-1
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: New submission
`
    assert.throws(() => compileConduits(yaml, FASTMAIL_ONLY), /methods is required/)
  })

  it('rejects methods: [] (present but empty), same as methods missing entirely', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    const yaml = `
conduits:
  contact-form:
    methods: []
    source:
      type: fastmail
      identityId: ident-1
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: New submission
`
    assert.throws(() => compileConduits(yaml, FASTMAIL_ONLY), /methods is required/)
  })

  it('rejects a bearer token whose referenced env var is not set', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    delete process.env.CONTACT_FORM_TOKEN
    assert.throws(
      () =>
        compileConduits(
          baseYaml(`
    bearerToken:
      value: env:CONTACT_FORM_TOKEN
      requiredFor: [POST]
`),
          FASTMAIL_ONLY,
        ),
      /CONTACT_FORM_TOKEN is not set/,
    )
  })

  it('rejects an unknown hidden-field policy', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    assert.throws(
      () =>
        compileConduits(
          baseYaml(`
    hiddenFields:
      - name: trap
        policy: nonsense
`),
          FASTMAIL_ONLY,
        ),
      /unknown policy 'nonsense'/,
    )
  })

  it('rejects a malformed allowlist entry (neither a string nor {ip, ...})', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    assert.throws(
      () =>
        compileConduits(
          baseYaml(`
    allowlist:
      - 12345
`),
          FASTMAIL_ONLY,
        ),
      /allowlist\[0\] must be an IP string or \{ip, comment\}/,
    )
  })

  it('rejects a malformed Fastmail source missing identityId', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    const yaml = `
conduits:
  contact-form:
    methods: [POST]
    source:
      type: fastmail
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: New submission
`
    assert.throws(() => compileConduits(yaml, FASTMAIL_ONLY), /source.identityId is required/)
  })

  it('rejects a malformed Fastmail source missing recipients', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    const yaml = `
conduits:
  contact-form:
    methods: [POST]
    source:
      type: fastmail
      identityId: ident-1
      credential: env:FASTMAIL_TOKEN
      subject: New submission
`
    assert.throws(() => compileConduits(yaml, FASTMAIL_ONLY), /source.recipients must be a non-empty list/)
  })

  it('rejects a curi containing path-unsafe characters (e.g. a slash)', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    const yaml = `
conduits:
  "contact/form":
    methods: [POST]
    source:
      type: fastmail
      identityId: ident-1
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: New submission
`
    assert.throws(() => compileConduits(yaml, FASTMAIL_ONLY), /curi must contain only letters, digits, '-', and '_'/)
  })

  it('aborts the entire load on one invalid conduit, rather than returning a partial config for the ones that were fine', () => {
    process.env.FASTMAIL_TOKEN = 'fastmail-secret'
    const yaml = `
conduits:
  good-conduit:
    methods: [POST]
    source:
      type: fastmail
      identityId: ident-1
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: New submission
  bad-conduit:
    methods: []
    source:
      type: fastmail
      identityId: ident-2
      credential: env:FASTMAIL_TOKEN
      recipients: [owner@example.com]
      subject: Another submission
`
    // If this returned a partial array (e.g. just good-conduit), the
    // call below would succeed and this assertion would fail — the
    // only way it can throw is if the whole file was rejected as one
    // unit, discarding good-conduit's otherwise-valid compilation too.
    assert.throws(() => compileConduits(yaml, FASTMAIL_ONLY), /conduit 'bad-conduit': methods is required/)
  })
})
