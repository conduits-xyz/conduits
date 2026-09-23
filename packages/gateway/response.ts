export function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  const text = JSON.stringify(body)
  return new Response(text, {
    status,
    // Explicit, not left to the runtime to infer: this is what the
    // observation wrapper in dispatch.ts reads back for
    // clientResponseBytes — correct HTTP either way.
    headers: { 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(text).length), ...headers },
  })
}

// The hosted-page responses (page-controller.ts, and
// dispatch.ts's HTML failure-rendering wrapper around write()) — same
// explicit content-length reasoning as jsonResponse above.
export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'content-length': String(new TextEncoder().encode(html).length) },
  })
}
