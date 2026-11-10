import { createHash } from 'node:crypto'
import type { Middleware } from 'remix/router'

import { problemResponse } from '../response.ts'
import { jsonBodyContext } from './body.ts'
import { conduitConfigContext } from './conduit-config.ts'
import { canonicalJson } from '../canonical-json.ts'
import type { GatewayClock } from '../pipeline.ts'

// A response as kept for a key: what a repeat of the request gets again.
export interface StoredResponse {
  status: number
  headers: [string, string][]
  body: string
}

// What a key holds when a request arrives with it: nothing yet (the
// request goes ahead), a request still running, another request, or a
// finished one's response.
export type IdempotencyClaim =
  | { kind: 'new' }
  | { kind: 'running' }
  | { kind: 'reused' }
  | { kind: 'replay'; response: StoredResponse }

// Where the keys of creates are kept, per conduit (`scope`). A key is
// kept for `ttlMs` from its first request; after that it is free again.
export interface IdempotencyStore {
  // Claims `key` for a request whose fingerprint is `fingerprint`, or
  // says what the key already holds.
  claim(scope: string, key: string, fingerprint: string, nowMs: number, ttlMs: number): Promise<IdempotencyClaim>
  // The claimed request's response, for its repeats.
  complete(scope: string, key: string, response: StoredResponse): Promise<void>
  // Frees a claimed key whose request ended without a response.
  release(scope: string, key: string): Promise<void>
}

export interface Idempotency {
  store: IdempotencyStore
  // How long a key is kept, from its first request.
  ttlMs: number
}

// A key in memory: lost on a restart, not shared between processes.
// Expired keys are dropped when a key is claimed.
export function createMemoryIdempotencyStore(): IdempotencyStore {
  const entries = new Map<string, { fingerprint: string; expiresAtMs: number; response: StoredResponse | null }>()
  const id = (scope: string, key: string) => `${scope}\n${key}`
  return {
    async claim(scope, key, fingerprint, nowMs, ttlMs) {
      for (const [k, entry] of entries) if (entry.expiresAtMs <= nowMs) entries.delete(k)
      const entry = entries.get(id(scope, key))
      if (!entry) {
        entries.set(id(scope, key), { fingerprint, expiresAtMs: nowMs + ttlMs, response: null })
        return { kind: 'new' }
      }
      if (entry.fingerprint !== fingerprint) return { kind: 'reused' }
      return entry.response ? { kind: 'replay', response: entry.response } : { kind: 'running' }
    },
    async complete(scope, key, response) {
      const entry = entries.get(id(scope, key))
      if (entry) entry.response = response
    },
    async release(scope, key) {
      entries.delete(id(scope, key))
    },
  }
}

// Keys a client can send: 1 to 255 visible ASCII characters
// (draft-ietf-httpapi-idempotency-key-header).
const KEY_PATTERN = /^[\x21-\x7e]{1,255}$/

// A create with an `Idempotency-Key` header is done once for each key
// and conduit while the key is kept (docs/gateway-api.md, "Idempotency
// keys"): a repeat with the same body gets the first response again,
// with `Idempotent-Replayed: true`, and writes or sends nothing. Runs
// after the access checks and before source errors become responses,
// so a send whose outcome is unknown (502) is kept and replayed too.
export function enforceIdempotency({ store, ttlMs }: Idempotency, clock: GatewayClock): Middleware {
  return async (context, next) => {
    const key = context.headers.get('idempotency-key')
    if (key === null) return next()
    if (!KEY_PATTERN.test(key)) {
      return problemResponse('invalid_idempotency_key', { detail: 'An Idempotency-Key is 1 to 255 visible ASCII characters.' })
    }
    const config = context.get(conduitConfigContext)
    if (!config) throw new Error('enforceIdempotency() requires resolveConduitConfig() middleware to run first')

    const fingerprint = createHash('sha256').update(canonicalJson([context.url.pathname, context.get(jsonBodyContext)])).digest('hex')
    const claim = await store.claim(config.curi, key, fingerprint, clock.now().getTime(), ttlMs)
    if (claim.kind === 'reused') {
      return problemResponse('idempotency_key_reused', { detail: 'This Idempotency-Key was used for a different request.' })
    }
    if (claim.kind === 'running') {
      return problemResponse('idempotency_key_in_use', { detail: 'A request with this Idempotency-Key is still running.', retryAfter: 1 })
    }
    if (claim.kind === 'replay') {
      const headers = new Headers(claim.response.headers)
      headers.set('idempotent-replayed', 'true')
      return new Response(claim.response.body, { status: claim.response.status, headers })
    }

    let response: Response
    try {
      response = await next()
    } catch (error) {
      await store.release(config.curi, key)
      throw error
    }
    await store.complete(config.curi, key, { status: response.status, headers: [...response.headers], body: await response.clone().text() })
    return response
  }
}
