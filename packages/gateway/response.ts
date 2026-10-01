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
