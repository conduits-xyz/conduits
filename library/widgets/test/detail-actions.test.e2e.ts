import * as path from 'node:path'
import * as assert from 'remix/assert'
import { describe, it } from 'remix/test'
import { createTestServer } from 'remix/node-fetch-server/test'
import { createRouter } from 'remix/router'
import { staticFiles } from 'remix/middleware/static'

// setupLibrarySignupLink() in detail-actions.js. The library's static
// files are the same on every conduits.xyz host, so the "Sign up" link
// is derived from the host that served the page.

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

  // Playwright answers the navigation itself, so no DNS lookup happens
  // (as in conduit-url-input.test.e2e.ts).
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
