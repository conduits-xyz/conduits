import { createContextKey, type Middleware } from 'remix/router'

import { problemResponse } from '../response.ts'
import { expandBracketForm } from '@conduits/conduit'

export const jsonBodyContext = createContextKey<Record<string, unknown>>({})

// DELETE may have a body: a bulk delete sends {ids: [...]}. A single
// DELETE has none, which parses as an empty object.
const BODYLESS_METHODS = new Set(['GET', 'HEAD'])

// Accepts JSON, x-www-form-urlencoded and multipart/form-data (fields,
// not files) and normalizes all three to `{fields: {...}}` or
// `{records: [...]}`, so a plain HTML <form> can POST to a conduit.
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
          // Files are ignored.
        }
        context.set(jsonBodyContext, expandBracketForm(entries))
        return next()
      } catch {
        return problemResponse('invalid_body', { detail: 'The multipart body cannot be read.' })
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
      return problemResponse('invalid_body', { detail: 'The body must be a JSON object.' })
    }
  }
}
