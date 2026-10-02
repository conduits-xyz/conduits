// A conduit's `<base>/.conduits/readyz` (see dispatch.ts), behind
// createReadyzGatewayMiddleware(deps): the curi resolves to an active
// conduit and passes allowlist and throttle. No RACM, token or source
// access. global-readyz.ts is the Gateway-wide check.
export function gatewayReadyzAction(): Response {
  return new Response(null, { status: 204 })
}
