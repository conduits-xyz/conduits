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
  invalid_value: { status: 400, title: 'Invalid value' },
  unknown_member: { status: 400, title: 'Unknown member' },
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

// One field or element at fault; `pointer` is a JSON Pointer into the
// request body.
export interface FieldError<Code extends string = ErrorCode> {
  code: Code
  field?: string
  pointer: string
  detail: string
}

export type ProblemOptions<Code extends string> = { detail?: string; errors?: FieldError<Code>[]; retryAfter?: number; headers?: Record<string, string> }

// Builds RFC 9457 Problem Details from a table of codes, each with its
// status and title; `type` links to the code's entry in `docs`. Adds
// `errors` and `retryAfter` when given. A problem is never cached.
export function problemResponder<Code extends string>(errors: Record<Code, { status: number; title: string }>, docs: string) {
  return (code: Code, options: ProblemOptions<Code> = {}): Response => {
    const { status, title } = errors[code]
    const body = {
      type: `${docs}#${code.replaceAll('_', '-')}`,
      title,
      status,
      ...(options.detail ? { detail: options.detail } : {}),
      code,
      ...(options.errors ? { errors: options.errors } : {}),
      ...(options.retryAfter !== undefined ? { retryAfter: options.retryAfter } : {}),
    }
    const headers: Record<string, string> = { 'cache-control': 'no-store', ...options.headers }
    if (options.retryAfter !== undefined) headers['Retry-After'] = String(options.retryAfter)
    return respond(body, status, 'application/problem+json', headers)
  }
}

export const problemResponse = problemResponder(ERRORS, 'https://github.com/conduits-xyz/conduits/blob/main/docs/gateway-api.md')

// A JSON Pointer segment (RFC 6901): `~` and `/` escaped.
export const pointerSegment = (name: string) => name.replaceAll('~', '~0').replaceAll('/', '~1')
