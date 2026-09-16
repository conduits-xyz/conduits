import { createContextKey, type Middleware } from 'remix/router'

import { jsonResponse } from '../response.ts'
import { expandBracketForm } from '@conduits/conduit'

export const jsonBodyContext = createContextKey<Record<string, unknown>>({})

// DELETE is not bodyless: a bulk destroy sends its ids as a JSON body
// ({ids: [...]}) — see controller.ts's bulkDestroy. A single-item DELETE
// (no body) still parses fine: an empty body falls through to the
// empty-object default below.
const BODYLESS_METHODS = new Set(['GET', 'HEAD'])

// Accepts application/json, application/x-www-form-urlencoded, and
// multipart/form-data (fields only, no file uploads), normalizing all
// three into the same `{fields: {...}}` / `{records: [...]}` shape — so a
// plain HTML <form> (no JS, no fetch) can POST directly to a conduit
// exactly like a JSON client can.
export function parseJsonBody(): Middleware<{ key: typeof jsonBodyContext; value: Record<string, unknown> }> {
  return async (context, next) => {
    if (BODYLESS_METHODS.has(context.method)) return next()

    const contentType = context.headers.get('content-type') ?? ''

    if (contentType.includes('application/x-www-form-urlencoded')) {
      const text = await context.request.text()
      context.set(jsonBodyContext, expandBracketForm(new URLSearchParams(text)))
      return next()
    }

    if (contentType.includes('multipart/form-data')) {
      try {
        const formData = await context.request.formData()
        const entries: [string, string][] = []
        for (const [key, value] of formData) {
          if (typeof value === 'string') entries.push([key, value])
          // File values are silently dropped — this endpoint accepts
          // fields, not uploads.
        }
        context.set(jsonBodyContext, expandBracketForm(entries))
        return next()
      } catch {
        return jsonResponse({ error: 'Invalid multipart body' }, 400)
      }
    }

    const text = await context.request.text()
    if (text.trim() === '') {
      context.set(jsonBodyContext, {})
      return next()
    }

    try {
      const parsed = JSON.parse(text)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('body must be a JSON object')
      }
      context.set(jsonBodyContext, parsed)
      return next()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }
  }
}
