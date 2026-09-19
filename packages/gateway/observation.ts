import { createContextKey } from 'remix/router'

// Every request the dispatcher sees ends up as exactly one of these,
// regardless of outcome — an unmatched route, a rejected request, a
// real provider call, or a genuine 500. Deliberately neutral: this
// package never decides what an observation means (billing, analytics,
// nothing) — it only measures what actually happened and hands the
// result to whichever GatewayRuntime.recordObservation a host supplies.
// See GatewayRuntime's own doc in types.ts.
export type RouteKind = 'bare' | 'item' | 'schema' | 'readyz' | 'unmatched'

export type StatusClass = 'success' | 'clientError' | 'rejected' | 'notFound' | 'providerError' | 'serverError'

// Classified from the final response status alone — RACM/allowlist/
// bearer-token/throttle already return four distinct, non-overlapping
// codes (405/403/401/429), so 'rejected' falls out with no new tagging
// needed in any of those middleware. 502 is exactly handleSourceErrors'
// own translation of a ConduitAuthError/ConduitSourceError. 404 is its
// own bucket, not folded into clientError or rejected — it means "this
// curi doesn't resolve to anything," a different fact from "the caller
// did something wrong" or "this was blocked."
export function classifyStatus(status: number): StatusClass {
  if (status === 401 || status === 403 || status === 405 || status === 429) return 'rejected'
  if (status === 404) return 'notFound'
  if (status === 502) return 'providerError'
  if (status >= 500) return 'serverError'
  if (status >= 400) return 'clientError'
  return 'success'
}

export interface GatewayObservation {
  timestamp: string
  latencyMs: number
  // Absent only for a route that never matched any binding at all
  // (dispatch.ts's own resolveRoute() returning null) — every other
  // case, including a curi that resolves to no live conduit, still has
  // a real curi to attribute to.
  curi: string | undefined
  routeKind: RouteKind
  host: string | undefined
  method: string
  status: number
  statusClass: StatusClass
  clientRequestBytes: number
  clientResponseBytes: number
  providerRequestBytes: number
  providerResponseBytes: number
  // Whether the pipeline actually attempted a call against the
  // provider (Sheets/Fastmail/Gmail) — the one fact a future billing
  // decision hangs on, kept here as a physical observation, not a
  // pricing concept. False for anything rejected, not-found, or
  // honeypot-dropped without at least one real record alongside it.
  providerAttempted: boolean
  honeypotDropCount: number
  suriType: string | undefined
}

// Set once, deep in loadConduitTable's own finally block (right
// alongside its existing client.disconnect() call), read back once by
// the outer dispatch() wrapper — the same pattern honeypotDropCountContext
// below uses. Absent entirely when no runtime supplied
// GatewayRuntime.instrumentFetch (the common case), or for any request
// that never reached loadConduitTable at all (rejected, not-found).
export const providerBytesContext = createContextKey<{
  providerRequestBytes: number
  providerResponseBytes: number
  providerAttempted: boolean
}>()

// Set by controller.ts's write()/bulk write actions when a submission
// trips the honeypot — replaces the old per-drop recordEvent loop with
// one number the outer wrapper reads back once.
export const honeypotDropCountContext = createContextKey<number>()
