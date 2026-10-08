// The JSON response helper for the mocked-fetch tests (fastmail, gmail,
// sheets-http-client).
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

// Answers every fetch with `handler`, given the request's URL, until the
// returned function puts the real fetch back. Each test file routes the
// requests its API makes.
export function replaceFetch(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>): () => void {
  const original = globalThis.fetch
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    handler(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, init)) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}
