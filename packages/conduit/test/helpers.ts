// The JSON response helper for the mocked-fetch tests (fastmail, gmail,
// sheets-http-client). Each keeps its own mockFetch(), since each API
// routes requests differently.
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
