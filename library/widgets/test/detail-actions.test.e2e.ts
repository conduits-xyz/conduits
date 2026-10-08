import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { createTestServer } from 'remix/node-fetch-server/test'

import { createStaticRouter, serveAs } from './helpers.ts'

// setupLibrarySignupLink() in detail-actions.js. The library's static
// files are the same on every conduits.xyz host, so the "Sign up" link
// is derived from the host that served the page.

describe('detail-actions.js — library signup link (e2e)', () => {
  it('on a plain (non-conduits.xyz) origin, falls back to the generic conduits.xyz signup link', async (t) => {
    const server = await createTestServer(createStaticRouter().fetch)
    const page = await t.serve(server)

    await page.goto(server.baseUrl + '/xyz-waitlist/')
    const link = page.locator('[data-library-signup]')
    await link.waitFor()
    assert.equal(await link.getAttribute('href'), 'https://conduits.xyz')
  })

  it('on a *.conduits.xyz marketing host, points at that same environment\'s own app.* control plane, never the bare production URL', async (t) => {
    const server = await createTestServer(createStaticRouter().fetch)
    const page = await t.serve(server)

    await serveAs(page, 'https://dev.conduits.xyz', server)

    await page.goto('https://dev.conduits.xyz/xyz-waitlist/')
    const link = page.locator('[data-library-signup]')
    await link.waitFor()
    assert.equal(await link.getAttribute('href'), 'https://app.dev.conduits.xyz')
    await page.getByText('Sign up at app.dev.conduits.xyz to get a free 3-pack.').waitFor()
  })
})
