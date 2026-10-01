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

// The first key (if any) whose hash matches the presented token AND
// whose own scopes cover the requested method — a key that matches the
// token but doesn't cover this method is the same as no match, never a
// partial pass. Multiple keys can each independently authorize the
// same method (see scoped-api-keys.md's CoveringKeys(method)); this
// only needs to find one.
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

// Gates a method that's already RACM-allowed but additionally marked
// token-required. "The one shared token" is gone — this now accepts
// any of the conduit's own active keys whose scopes cover the method.
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

// Unconditional, unlike enforceBearerToken() above — a conduit's
// `<base>/.conduits/schema` action always requires a bearer token,
// regardless of tokenRequiredMethods. Any currently-valid key
// satisfies this, regardless of its own scopes: this isn't gated by a
// specific method's scope, only by "does the caller hold some key for
// this conduit at all." Used by createSchemaGatewayMiddleware
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
