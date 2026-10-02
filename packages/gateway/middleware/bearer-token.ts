import type { Middleware } from 'remix/router'

import { verifyBearerToken } from '../bearer-token.ts'
import { jsonResponse } from '../response.ts'
import { conduitConfigContext } from './conduit-config.ts'
import type { ApiKeyRef } from '../types.ts'
import { apiKeyIdContext } from '../observation.ts'

const BEARER_PREFIX = 'Bearer '

function presentedToken(context: { headers: Headers }): string | null {
  const header = context.headers.get('authorization') ?? ''
  if (!header.startsWith(BEARER_PREFIX)) return null
  const token = header.slice(BEARER_PREFIX.length).trim()
  return token === '' ? null : token
}

// The first key whose hash matches the token and whose scopes include
// the method. A matching key without the method doesn't count.
function matchingKeyFor(token: string, method: string, apiKeys: ApiKeyRef[]): ApiKeyRef | null {
  for (const key of apiKeys) {
    if (key.scopes.includes(method) && verifyBearerToken(token, key.tokenHash)) return key
  }
  return null
}

function matchingKeyForContext(context: { headers: Headers }, method: string, apiKeys: ApiKeyRef[]): ApiKeyRef | null {
  const token = presentedToken(context)
  return token !== null ? matchingKeyFor(token, method, apiKeys) : null
}

// For a method RACM allows and marks token-required: accepts any active
// key whose scopes include it.
export function enforceBearerToken(): Middleware {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('enforceBearerToken() requires resolveConduitConfig() middleware to run first')

    if (!config.tokenRequiredMethods.includes(context.method)) return next()

    const key = matchingKeyForContext(context, context.method, config.apiKeys)
    if (!key) return jsonResponse({ error: 'Unauthorized' }, 401)
    if (key.id != null) context.set(apiKeyIdContext, key.id)
    return next()
  }
}

// For `<base>/.conduits/schema`, which always needs a token whatever
// tokenRequiredMethods says. Any valid key for the conduit passes,
// whatever its scopes. Used by createSchemaGatewayMiddleware
// (pipeline.ts).
export function requireBearerToken(): Middleware {
  return async (context, next) => {
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('requireBearerToken() requires resolveConduitConfig() middleware to run first')

    const token = presentedToken(context)
    const key = token === null ? null : config.apiKeys.find((candidate) => verifyBearerToken(token, candidate.tokenHash)) ?? null
    if (!key) return jsonResponse({ error: 'Unauthorized' }, 401)
    if (key.id != null) context.set(apiKeyIdContext, key.id)
    return next()
  }
}
