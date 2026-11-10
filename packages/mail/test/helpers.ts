// A fetch that answers each request with `handler`, recording requests.
export function fakeFetch(handler: (url: string, init: RequestInit | undefined, index: number) => Response | Promise<Response>) {
  const requests: { url: string; init: RequestInit | undefined }[] = []
  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input)
    requests.push({ url, init })
    return handler(url, init, requests.length - 1)
  }) as typeof fetch
  return { fetch: fetchImpl, requests }
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

export const NOW = Date.parse('2026-10-05T12:00:00.000Z')

export function counter(prefix = 'id') {
  let n = 0
  return () => `${prefix}${++n}`
}
