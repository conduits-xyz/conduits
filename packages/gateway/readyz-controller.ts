// A conduit-path's `<base>/.conduits/readyz` action (see dispatch.ts) —
// runs behind createReadyzGatewayMiddleware(deps): confirms the curi
// resolves to an active conduit and passes allowlist/throttle; no RACM
// or bearer-token gate, no data-source access. Distinct from the
// Gateway-global `/.conduits/readyz` (global-readyz.ts), which checks
// the process is up at all, independent of any one conduit.
export function gatewayReadyzAction(): Response {
  return new Response(null, { status: 204 })
}
