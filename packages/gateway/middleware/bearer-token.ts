import type { Middleware } from 'remix/router'

import { verifyBearerToken } from '../bearer-token.ts'
import { jsonResponse } from '../response.ts'
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
