function respond(body: unknown, status: number, contentType: string, headers?: Record<string, string>): Response {
  const text = JSON.stringify(body)
  return new Response(text, {
    status,
    // Set explicitly; dispatch.ts reads it for clientResponseBytes.
    headers: { 'content-type': contentType, 'content-length': String(new TextEncoder().encode(text).length), ...headers },
  })
}

export function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  return respond(body, status, 'application/json', headers)
}

// Every error code the gateway returns, with its fixed status and title
// (docs/gateway-api.md#errors). Codes are part of the API: a change to
// one goes in the changelog.
const ERRORS = {
  invalid_body: { status: 400, title: 'Invalid body' },
  id_not_allowed: { status: 400, title: 'Id not allowed' },
  too_many_records: { status: 400, title: 'Too many records' },
  duplicate_ids: { status: 400, title: 'Duplicate ids' },
  bulk_not_supported: { status: 400, title: 'Bulk create not supported' },
  invalid_limit: { status: 400, title: 'Invalid limit' },
  unknown_cursor: { status: 400, title: 'Unknown cursor' },
  unknown_field: { status: 400, title: 'Unknown field' },
  unauthorized: { status: 401, title: 'Unauthorized' },
  forbidden: { status: 403, title: 'Forbidden' },
  not_found: { status: 404, title: 'Not found' },
  record_not_found: { status: 404, title: 'Record not found' },
  method_not_allowed: { status: 405, title: 'Method not allowed' },
  rate_limited: { status: 429, title: 'Too many requests' },
  internal_error: { status: 500, title: 'Internal error' },
  source_unavailable: { status: 502, title: 'Source unavailable' },
  source_busy: { status: 503, title: 'Source busy' },
} as const

type ErrorCode = keyof typeof ERRORS

const ERROR_DOCS = 'https://github.com/conduits-xyz/conduits/blob/main/docs/gateway-api.md'

// One field or element at fault; `pointer` is a JSON Pointer into the
// request body.
export interface FieldError {
  code: ErrorCode
  field?: string
  pointer: string
  detail: string
}

// An error as RFC 9457 Problem Details, with the gateway's `code`, and
// `errors` and `retryAfter` when they apply.
export function problemResponse(
  code: ErrorCode,
  options: { detail?: string; errors?: FieldError[]; retryAfter?: number; headers?: Record<string, string> } = {},
): Response {
  const { status, title } = ERRORS[code]
  const body = {
    type: `${ERROR_DOCS}#${code.replaceAll('_', '-')}`,
    title,
    status,
    ...(options.detail ? { detail: options.detail } : {}),
    code,
    ...(options.errors ? { errors: options.errors } : {}),
    ...(options.retryAfter !== undefined ? { retryAfter: options.retryAfter } : {}),
  }
  const headers: Record<string, string> = { ...options.headers }
  if (options.retryAfter !== undefined) headers['Retry-After'] = String(options.retryAfter)
  return respond(body, status, 'application/problem+json', headers)
}

// A JSON Pointer segment (RFC 6901): `~` and `/` escaped.
export const pointerSegment = (name: string) => name.replaceAll('~', '~0').replaceAll('/', '~1')
