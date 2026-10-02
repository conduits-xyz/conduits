// The Gateway-wide `/.conduits/readyz` (docs/data-model.md, reserved
// namespace): a liveness check with no config lookup or dependencies.
// The per-conduit `<base>/.conduits/readyz` (readyz-controller.ts)
// checks one conduit.
export function globalReadyzAction(): Response {
  return new Response(null, { status: 204 })
}
