// Gateway-global `/.conduits/readyz` (see docs/data-model.md's
// reserved infrastructure namespace) — confirms the Gateway process
// itself can serve at all, independent of any one conduit. No config
// lookup, no DB, no dependencies: a true liveness check, not a
// readiness check of any specific backend. Distinct from the
// conduit-relative `<base>/.conduits/readyz` (readyz-controller.ts),
// which checks one specific conduit resolves and is active.
export function globalReadyzAction(): Response {
  return new Response(null, { status: 204 })
}
