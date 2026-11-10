import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'

import { fakeConduit } from './fake-gateway.ts'

// The gateway has no cookies, so any origin may call it: every
// response, an error too, allows every origin, and a preflight is
// answered on every conduit path.

describe('CORS', () => {
  it('allows every origin on a success and on an error', async () => {
    const { send } = fakeConduit('cors')
    for (const path of ['', '/no-such-record']) assert.equal((await send(path)).headers.get('access-control-allow-origin'), '*', path)
  })

  it('answers a preflight on the bare, item and schema paths, with the headers a caller sends', async () => {
    const { send } = fakeConduit('cors')
    for (const path of ['', '/some-id', '/.conduits/schema']) {
      const preflight = await send(path, { method: 'OPTIONS' })
      assert.equal(preflight.status, 204, path)
      assert.equal(preflight.headers.get('access-control-allow-origin'), '*')
      assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /PATCH/)
      assert.equal(preflight.headers.get('access-control-allow-headers'), 'Content-Type, Authorization, Idempotency-Key, If-Match')
    }
  })
})
