export function jsonResponse(body: unknown, status = 200, headers?: Record<string, string>): Response {
  const text = JSON.stringify(body)
  return new Response(text, {
    status,
    // Set explicitly; dispatch.ts reads it for clientResponseBytes.
    headers: { 'content-type': 'application/json', 'content-length': String(new TextEncoder().encode(text).length), ...headers },
  })
}
