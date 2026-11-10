import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import {
  normalizeHost,
  normalizeRoutePath,
  matchRouteBinding,
  classifyConduitAction,
  InvalidRoutePathError,
  type RouteBinding,
} from '../route-binding.ts'

describe('normalizeHost', () => {
  it('lowercases and strips a trailing port', () => {
    assert.equal(normalizeHost('Forms.Example.com:8443'), 'forms.example.com')
  })

  it('returns undefined for undefined/null/empty', () => {
    assert.equal(normalizeHost(undefined), undefined)
    assert.equal(normalizeHost(null), undefined)
    assert.equal(normalizeHost(''), undefined)
  })
})

describe('normalizeRoutePath', () => {
  it('accepts a plain path unchanged', () => {
    assert.equal(normalizeRoutePath('/mark-k7q/contact'), '/mark-k7q/contact')
  })

  it('accepts the bare root', () => {
    assert.equal(normalizeRoutePath('/'), '/')
  })

  it('rejects a path with no leading slash', () => {
    assert.throws(() => normalizeRoutePath('contact'), InvalidRoutePathError)
  })

  it('rejects a trailing slash (other than the bare root)', () => {
    assert.throws(() => normalizeRoutePath('/contact/'), InvalidRoutePathError)
  })

  it("rejects '.' and '..' segments", () => {
    assert.throws(() => normalizeRoutePath('/./contact'), InvalidRoutePathError)
    assert.throws(() => normalizeRoutePath('/../contact'), InvalidRoutePathError)
  })

  it('rejects a path that uses the reserved .conduits segment, case-insensitively', () => {
    assert.throws(() => normalizeRoutePath('/contact/.conduits/evil'), InvalidRoutePathError)
    assert.throws(() => normalizeRoutePath('/.CONDUITS/evil'), InvalidRoutePathError)
  })
})

describe('matchRouteBinding', () => {
  const bindings: RouteBinding[] = [
    { path: '/mark-k7q/contact', curi: 'mark-k7q/contact' },
    { path: '/mark-k7q/newsletter', curi: 'mark-k7q/newsletter' },
    { host: 'forms.markwilliams.com', path: '/contact', curi: 'mark-k7q/contact' },
  ]

  it('matches an exact host-agnostic binding, suffix empty', () => {
    const match = matchRouteBinding(bindings, 'gateway.example.com', '/mark-k7q/contact')
    assert.ok(match)
    assert.equal(match!.binding.curi, 'mark-k7q/contact')
    assert.equal(match!.suffix, '')
  })

  it('returns the remaining suffix for a longer request path', () => {
    const match = matchRouteBinding(bindings, 'gateway.example.com', '/mark-k7q/contact/.conduits/schema')
    assert.ok(match)
    assert.equal(match!.binding.curi, 'mark-k7q/contact')
    assert.equal(match!.suffix, '/.conduits/schema')
  })

  it('only matches a host-scoped binding on that exact host', () => {
    const onHost = matchRouteBinding(bindings, 'forms.markwilliams.com', '/contact')
    assert.equal(onHost?.binding.curi, 'mark-k7q/contact')

    const wrongHost = matchRouteBinding(bindings, 'someone-else.example.com', '/contact')
    assert.equal(wrongHost, null)
  })

  it('is case-insensitive and port-insensitive on host', () => {
    const match = matchRouteBinding(bindings, 'Forms.MarkWilliams.com:443', '/contact')
    assert.equal(match?.binding.curi, 'mark-k7q/contact')
  })

  it('returns null when no binding matches', () => {
    assert.equal(matchRouteBinding(bindings, 'gateway.example.com', '/nobody-home'), null)
  })

  it('prefers the longest matching binding when more than one could apply', () => {
    const overlapping: RouteBinding[] = [
      { path: '/forms', curi: 'acme/generic-forms' },
      { path: '/forms/contact', curi: 'acme/contact' },
    ]
    const match = matchRouteBinding(overlapping, undefined, '/forms/contact/42')
    assert.equal(match?.binding.curi, 'acme/contact')
    assert.equal(match?.suffix, '/42')
  })
})

describe('classifyConduitAction', () => {
  it('classifies an empty suffix as bare', () => {
    assert.deepEqual(classifyConduitAction(''), { kind: 'bare' })
  })

  it('classifies a single non-reserved segment as an item, decoded', () => {
    assert.deepEqual(classifyConduitAction('/hello%20world'), { kind: 'item', id: 'hello world' })
  })

  it('classifies .conduits/schema and .conduits/readyz', () => {
    assert.deepEqual(classifyConduitAction('/.conduits/schema'), { kind: 'schema' })
    assert.deepEqual(classifyConduitAction('/.conduits/readyz'), { kind: 'readyz' })
  })

  it('rejects the bare reserved segment as an item id', () => {
    assert.equal(classifyConduitAction('/.conduits'), null)
  })

  it('rejects an unknown path under the reserved segment', () => {
    assert.equal(classifyConduitAction('/.conduits/evil'), null)
  })

  it('rejects anything deeper than one extra segment', () => {
    assert.equal(classifyConduitAction('/42/extra'), null)
  })

  it('rejects a malformed percent-escape rather than throwing', () => {
    assert.equal(classifyConduitAction('/%'), null)
  })
})
