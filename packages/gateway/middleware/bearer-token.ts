import type { Middleware } from 'remix/router'

import { verifyBearerToken } from '../bearer-token.ts'
import { jsonResponse } from '../response.ts'
import { wantsHtml } from '../content-negotiation.ts'
import { conduitConfigContext } from './conduit-config.ts'

const BEARER_PREFIX = 'Bearer '

function hasValidBearerToken(context: { headers: Headers }, hash: string): boolean {
  const header = context.headers.get('authorization') ?? ''
  if (!header.startsWith(BEARER_PREFIX)) return false
  const token = header.slice(BEARER_PREFIX.length).trim()
  return token !== '' && verifyBearerToken(token, hash)
}

// Gates a method that's already RACM-allowed but additionally marked
// token-required.
export function enforceBearerToken(): Middleware {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('enforceBearerToken() requires resolveConduitConfig() middleware to run first')

    if (!config.tokenRequiredMethods.includes(context.method)) return next()

    if (!config.bearerTokenHash) return jsonResponse({ error: 'Unauthorized' }, 401)
    if (!hasValidBearerToken(context, config.bearerTokenHash)) return jsonResponse({ error: 'Unauthorized' }, 401)
    return next()
  }
}

// Hosted pages — page visibility and API GET authorization are separate
// concerns: a conduit that requires a bearer token on GET for its API
// can still serve its hosted page publicly, since a plain browser
// navigation has no way to attach an
// Authorization header at all. Used only in the bare-GET pipeline
// (pipeline.ts) — item/schema/readyz GETs, and every non-GET method,
// keep going through the unconditional enforceBearerToken() above.
// Falls through to that exact check whenever this isn't a genuine page
// render (no page configured, or the caller didn't ask for HTML) —
// never a second, looser bearer check.
export function enforceBearerTokenForBareGet(): Middleware {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('enforceBearerTokenForBareGet() requires resolveConduitConfig() middleware to run first')

    if (config.presentation && wantsHtml(context.headers.get('accept'))) return next()
    return enforceBearerToken()(context, next)
  }
}

// Unconditional, unlike enforceBearerToken() above — a conduit's
// `<base>/.conduits/schema` action always requires a bearer token,
// regardless of tokenRequiredMethods. Used by
// createSchemaGatewayMiddleware (pipeline.ts).
export function requireBearerToken(): Middleware {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('requireBearerToken() requires resolveConduitConfig() middleware to run first')

    if (!config.bearerTokenHash) return jsonResponse({ error: 'Unauthorized' }, 401)
    if (!hasValidBearerToken(context, config.bearerTokenHash)) return jsonResponse({ error: 'Unauthorized' }, 401)
    return next()
  }
}
