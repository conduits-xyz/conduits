// A (host, path) a request can arrive on and the curi it resolves to.
// Several bindings can resolve to one curi (a standard route and an
// alias); see docs/data-model.md "route binding". Self-hosted YAML
// usually omits the host.
export interface RouteBinding {
  // undefined matches any host.
  host?: string
  // Normalized: leading '/', no trailing slash except '/' itself, no
  // '.' or '..' segments, and no RESERVED_SEGMENT segment.
  path: string
  curi: string
}

// The reserved namespace for conduit metadata (like `.well-known`, but
// not one). Route paths can't contain it as a segment
// (normalizeRoutePath), and classifyConduitAction uses it to tell
// metadata paths from data paths.
export const RESERVED_SEGMENT = '.conduits'

export class InvalidRoutePathError extends Error {
  constructor(path: string, reason: string) {
    super(`route path '${path}' ${reason}`)
    this.name = 'InvalidRoutePathError'
  }
}

// Lowercased, without a :port, as browsers send Host. undefined or
// empty means no host constraint.
export function normalizeHost(host: string | undefined | null): string | undefined {
  if (!host) return undefined
  return host.split(':')[0]!.toLowerCase()
}

function splitPath(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0)
}

// Validates and normalizes a configured route path (not a request path;
// see matchRouteBinding). Throws on a bad value, so the config fails at
// load time rather than as a 404 later.
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
  // The request path after the binding's path: '' or a string starting
  // with '/'. Interpreted by classifyConduitAction.
  suffix: string
}

// The binding whose (host, path) is the longest prefix of the request's,
// matching whole segments only. Overlaps arise only from overlapping
// custom routes; default routes are unique.
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

// A GatewayDeps.resolveRoute (pipeline.ts) over a fixed in-memory list
// of bindings. A host with too many bindings to hold in memory
// implements resolveRoute itself.
export function createStaticRouteResolver(bindings: readonly RouteBinding[]): (host: string | undefined, pathname: string) => Promise<RouteMatch | null> {
  return async (host, pathname) => matchRouteBinding(bindings, host, pathname)
}

export type ConduitAction = { kind: 'bare' } | { kind: 'schema' } | { kind: 'readyz' } | { kind: 'item'; id: string }

// Interprets the path after a conduit's base path. Under the reserved
// segment only `.conduits/schema` and `.conduits/readyz` are recognized;
// anything else there, or a malformed percent-escape in an item id,
// returns null.
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
