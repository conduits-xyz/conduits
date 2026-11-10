// Both readyz routes answer 204 with no body. The Gateway-wide
// `/.conduits/readyz` (router.ts) is a liveness check with no config
// lookup. A conduit's `<base>/.conduits/readyz` (dispatch.ts) runs
// behind createReadyzGatewayMiddleware: the curi resolves to an active
// conduit and passes allowlist and throttle, with no RACM, token or
// source access.
export function readyzAction(): Response {
  return new Response(null, { status: 204 })
}
