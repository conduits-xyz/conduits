import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { clientIpFrom } from '../middleware/client-ip.ts'

describe('clientIpFrom', () => {
  it("takes a trusted forwarder's visitor, but never a forged entry in front of it", () => {
    const trusted = ['10.0.0.5']
    assert.equal(clientIpFrom('198.51.100.7, 10.0.0.5', trusted), '198.51.100.7')
    assert.equal(clientIpFrom('203.0.113.9, 198.51.100.7, 10.0.0.5', trusted), '198.51.100.7')
    assert.equal(clientIpFrom('10.0.0.5', trusted), '10.0.0.5')
    assert.equal(clientIpFrom(null, trusted), null)
    assert.equal(clientIpFrom('198.51.100.7, 10.0.0.6', trusted), '10.0.0.6')
  })
})
