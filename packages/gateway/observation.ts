import { createContextKey } from 'remix/router'

// One per request the dispatcher handles, whatever the outcome: no
// matching route, rejected, a provider call, or a 500. It records what
// happened; the host's GatewayRuntime.recordObservation decides what it
// means (see types.ts).
export type RouteKind = 'bare' | 'item' | 'schema' | 'readyz' | 'unmatched'

export type StatusClass = 'success' | 'clientError' | 'rejected' | 'notFound' | 'providerError' | 'serverError'

// From the response status alone. RACM, allowlist, bearer token and
// throttle return 405, 403, 401 and 429, which make up 'rejected'.
// handleSourceErrors returns 502 (ConduitAuthError, ConduitSourceError)
// and 503 (ConduitRateLimitError), which make up 'providerError'. 404
// (the curi resolves to nothing) has its own class.
export function classifyStatus(status: number): StatusClass {
  if (status === 401 || status === 403 || status === 405 || status === 429) return 'rejected'
  if (status === 404) return 'notFound'
  if (status === 502 || status === 503) return 'providerError'
  if (status >= 500) return 'serverError'
  if (status >= 400) return 'clientError'
  return 'success'
}

export interface GatewayObservation {
  timestamp: string
  latencyMs: number
  // Absent only when no route binding matched (resolveRoute returned
  // null).
  curi: string | undefined
  // The API key the request authenticated with, if any; an id, not a
  // secret.
  apiKeyId?: number
  routeKind: RouteKind
  host: string | undefined
  method: string
  status: number
  statusClass: StatusClass
  clientRequestBytes: number
  clientResponseBytes: number
  providerRequestBytes: number
  providerResponseBytes: number
  // Whether a provider call (Sheets, Fastmail, Gmail) was attempted.
  // False for rejected, not-found and honeypot-dropped requests with no
  // record written.
  providerAttempted: boolean
  honeypotDropCount: number
  suriType: string | undefined
}

// Set in loadConduitTable's finally block, beside disconnect(), and read
// once by dispatch(), like honeypotDropCountContext. Absent when the
// runtime has no instrumentFetch, or the request never reached
// loadConduitTable.
export const providerBytesContext = createContextKey<{
  providerRequestBytes: number
  providerResponseBytes: number
  providerAttempted: boolean
}>()

// Set by controller.ts's create actions when a submission is dropped;
// read once by dispatch().
export const honeypotDropCountContext = createContextKey<number>()

// Set by the bearer-token middleware when a token matches an API key;
// read by dispatch() for the observation.
export const apiKeyIdContext = createContextKey<number>()
