import * as path from 'node:path'
import type { Page } from 'playwright'
import { createRouter } from 'remix/router'
import { staticFiles } from 'remix/middleware/static'

// The library's demo files, served as a site serves them.
export function createStaticRouter() {
  return createRouter({ middleware: [staticFiles(path.resolve(import.meta.dirname, '..'), { index: true })] })
}

// Answers the page's requests to `origin`, a conduits.xyz host the test
// can't reach, from the test server. Playwright answers the navigation
// itself, so no DNS lookup happens.
export async function serveAs(page: Page, origin: string, server: { baseUrl: string }): Promise<void> {
  await page.route(`${origin}/**`, async (route) => {
    const url = new URL(route.request().url())
    const response = await fetch(server.baseUrl + url.pathname + url.search, { method: route.request().method() })
    await route.fulfill({
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: Buffer.from(await response.arrayBuffer()),
    })
  })
}
