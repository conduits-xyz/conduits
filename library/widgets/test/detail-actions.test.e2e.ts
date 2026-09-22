import * as path from 'node:path'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { createTestServer } from 'remix/node-fetch-server/test'
import { createRouter } from 'remix/router'
import { staticFiles } from 'remix/middleware/static'

// detail-actions.js's own setupLibrarySignupLink() — shared demo-page
// tooling, not part of any widget itself. Its one real behavioral
// claim: this library is one set of static files served identically to
// all three of this product's own environments (dev/staging/
// production), so the "Sign up" link can't be a single value baked
// into config.js the way it used to be; it has to be derived from
// whichever marketing host actually served this exact page.

const WIDGETS_ROOT = path.resolve(import.meta.dirname, '..')

function createStaticServer() {
  return createRouter({ middleware: [staticFiles(WIDGETS_ROOT, { index: true })] })
}

describe('detail-actions.js — library signup link (e2e)', () => {
  it('on a plain (non-conduits.xyz) origin, falls back to the generic conduits.xyz signup link', async (t) => {
    const server = await createTestServer(createStaticServer().fetch)
    const page = await t.serve(server)

    await page.goto(server.baseUrl + '/xyz-waitlist/')
    const link = page.locator('[data-library-signup]')
    await link.waitFor()
    assert.equal(await link.getAttribute('href'), 'https://conduits.xyz')
  })

  // Playwright intercepts the navigation itself, before any real DNS
  // lookup — see conduit-url-input.test.e2e.ts's identical technique —
  // so this needs no real network access to dev.conduits.xyz.
  it('on a *.conduits.xyz marketing host, points at that same environment\'s own app.* control plane, never the bare production URL', async (t) => {
    const server = await createTestServer(createStaticServer().fetch)
    const page = await t.serve(server)

    await page.route('https://dev.conduits.xyz/**', async (route) => {
      const url = new URL(route.request().url())
      const response = await fetch(server.baseUrl + url.pathname + url.search, { method: route.request().method() })
      await route.fulfill({
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: Buffer.from(await response.arrayBuffer()),
      })
    })

    await page.goto('https://dev.conduits.xyz/xyz-waitlist/')
    const link = page.locator('[data-library-signup]')
    await link.waitFor()
    assert.equal(await link.getAttribute('href'), 'https://app.dev.conduits.xyz')
    await page.getByText('Sign up at app.dev.conduits.xyz to get a free 3-pack.').waitFor()
  })
})
