// A RouteBinding is a concrete (host, path) a request can actually
// arrive on, mapped to the CURI it resolves to. Multiple bindings can
// resolve to the same curi (a conduit's standard route plus a custom
// alias) — see docs/data-model.md's "route binding". Kept generic
// enough for both the self-hosted Gateway (host usually omitted — a
// single-deployment operator's own YAML) and a managed Gateway's
// projected snapshot (host always present).
export interface RouteBinding {
  // undefined matches any host — the common self-hosted case where a
  // conduit's route isn't tied to a specific hostname.
  host?: string
  // Always normalized: starts with '/', no trailing slash except '/'
  // itself, no '.'/'..' segments, no segment equal to the reserved
  // infrastructure namespace (see RESERVED_SEGMENT).
  path: string
  curi: string
}

// The reserved infrastructure/meta namespace — visually similar to
// `.well-known` but not claiming to be one. A concrete route's own
// path may never use this as one of its segments (see
// normalizeRoutePath), and it's what separates conduit/data paths
// from conduit-metadata paths at request time (see
// classifyConduitAction).
export const RESERVED_SEGMENT = '.conduits'

export class InvalidRoutePathError extends Error {
  constructor(path: string, reason: string) {
    super(`route path '${path}' ${reason}`)
    this.name = 'InvalidRoutePathError'
  }
}

// Case-insensitive, strips a trailing :port — matches how browsers
// send Host headers and how an operator's own custom-domain config is
// typically written. undefined/empty means "no host constraint".
export function normalizeHost(host: string | undefined | null): string | undefined {
  if (!host) return undefined
  return host.split(':')[0]!.toLowerCase()
}

function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0)
}

// Validates and normalizes a route path supplied as configuration
// (self-hosted YAML, or a managed route projection) — never a live
// request path, see matchRouteBinding for that. Throws rather than
// silently coercing a bad value, so a misconfigured route fails at
// load time, not as a confusing 404 later.
export function normalizeRoutePath(path: string): string {
  if (!path.startsWith('/')) throw new InvalidRoutePathError(path, "must start with '/'")
  if (path !== '/' && path.endsWith('/')) throw new InvalidRoutePathError(path, "must not end with '/'")

  const segments = splitPath(path)
  for (const segment of segments) {
    if (segment === '.' || segment === '..') throw new InvalidRoutePathError(path, "must not contain '.' or '..' segments")
    if (segment.toLowerCase() === RESERVED_SEGMENT) {
      throw new InvalidRoutePathError(path, `must not use the reserved '${RESERVED_SEGMENT}' segment`)
    }
  }
  return segments.length === 0 ? '/' : '/' + segments.join('/')
}

export interface RouteMatch {
  binding: RouteBinding
  // What's left of the request path after the binding's own path is
  // stripped — '' (bare), or a leading-'/' string. Not yet
  // interpreted as an action — see classifyConduitAction.
  suffix: string
}

// Finds the binding whose (host, path) is the longest prefix — on
// segment boundaries, never a raw string prefix — of a live request's
// (host, pathname). Longest match wins when more than one binding
// could apply (the same convention most path-based routers/proxies
// use); in practice this only matters for a self-hosted operator's own
// overlapping custom `routes:`, since managed default routes never
// collide (each conduit's namespace/leaf is unique).
export function matchRouteBinding(bindings: readonly RouteBinding[], host: string | undefined, pathname: string): RouteMatch | null {
  const requestHost = normalizeHost(host)
  const requestSegments = splitPath(pathname)

  let best: { binding: RouteBinding; length: number } | null = null
  for (const binding of bindings) {
    const bindingHost = normalizeHost(binding.host)
    if (bindingHost !== undefined && bindingHost !== requestHost) continue

    const bindingSegments = splitPath(binding.path)
    if (bindingSegments.length > requestSegments.length) continue
    if (!bindingSegments.every((segment, i) => segment === requestSegments[i])) continue

    if (best === null || bindingSegments.length > best.length) best = { binding, length: bindingSegments.length }
  }

  if (best === null) return null
  const suffixSegments = requestSegments.slice(best.length)
  return { binding: best.binding, suffix: suffixSegments.length === 0 ? '' : '/' + suffixSegments.join('/') }
}

// The seam GatewayDeps.resolveRoute actually needs (see pipeline.ts).
// A precomputed, in-memory RouteBinding[] (self-hosted YAML, a managed
// Gateway's local active-config cache) is the common case — this
// wraps matchRouteBinding above for exactly that, so a host with a
// small, static binding list never has to write its own resolver.
// A host whose conduit set is too large or dynamic to precompute
// (resolving straight from its own live database, say) implements
// GatewayDeps.resolveRoute itself instead of using this.
export function createStaticRouteResolver(bindings: readonly RouteBinding[]): (host: string | undefined, pathname: string) => Promise<RouteMatch | null> {
  return async (host, pathname) => matchRouteBinding(bindings, host, pathname)
}

export type ConduitAction = { kind: 'bare' } | { kind: 'schema' } | { kind: 'readyz' } | { kind: 'item'; id: string }

// Interprets what's left of the request path once matchRouteBinding
// has stripped a conduit's own base path — the only shapes the
// protocol defines. Anything under the reserved segment other than
// exactly `.conduits/schema` or `.conduits/readyz` is deliberately
// unrecognized (null) rather than guessed at, per the reservation rule
// (a route may never resolve to something conflicting with Gateway/
// conduit metadata routing) — this includes a malformed
// percent-escape in what would otherwise be an item id.
export function classifyConduitAction(suffix: string): ConduitAction | null {
  if (suffix === '') return { kind: 'bare' }
  const segments = splitPath(suffix)

  if (segments.length === 1 && segments[0] !== RESERVED_SEGMENT) {
    try {
      return { kind: 'item', id: decodeURIComponent(segments[0]!) }
    } catch {
      return null
    }
  }
  if (segments.length === 2 && segments[0] === RESERVED_SEGMENT) {
    if (segments[1] === 'schema') return { kind: 'schema' }
    if (segments[1] === 'readyz') return { kind: 'readyz' }
  }
  return null
}
