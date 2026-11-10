import { createContextKey, type Middleware } from 'remix/router'

// The client's address, or null when the request has no X-Forwarded-For.
export const clientIpContext = createContextKey<string | null>(null)

// The gateway runs behind one reverse proxy, so the client address comes
// from X-Forwarded-For, not the raw socket. The last entry is the one
// that proxy wrote; anything to its left was sent by the caller and can
// be forged. Taking the last is correct whether the proxy replaces the
// header or appends to it (see docs/gateway-api.md's allowlist section).
//
// A trusted forwarder is a server that calls the gateway for its own
// visitors, for example one that serves pages, and sends its visitor's
// address as X-Forwarded-For. When the last entry is a trusted
// forwarder, the entry before it is the client.
export function clientIpFrom(forwardedFor: string | null, trustedForwarders: readonly string[]): string | null {
  if (!forwardedFor) return null
  const entries = forwardedFor.split(',').map((entry) => entry.trim()).filter(Boolean)
  let last = entries.length - 1
  while (last > 0 && trustedForwarders.includes(entries[last]!)) last--
  return entries[last] ?? null
}

export function resolveClientIp(trustedForwarders: readonly string[]): Middleware {
  return async (context, next) => {
    context.set(clientIpContext, clientIpFrom(context.headers.get('x-forwarded-for'), trustedForwarders))
    return next()
  }
}
