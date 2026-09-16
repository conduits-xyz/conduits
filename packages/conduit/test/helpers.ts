// Shared by every "mocked fetch, real request/response shapes" test
// file in this directory (fastmail/gmail/sheets-http-client) — each
// mocks a different real API's own request/response shape, but needs
// the exact same trivial JSON envelope to do it. mockFetch() itself
// stays local to each file rather than living here too: each one
// routes by a genuinely different shape (JMAP's session-vs-API-call
// split, Gmail's single fixed send URL, Sheets' many distinct
// endpoints with call-tracking) — forcing those into one shared helper
// would be the wrong kind of DRY, an abstraction with no real shared
// behavior behind it, just a shared name.
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
