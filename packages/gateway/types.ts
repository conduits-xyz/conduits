export type AllowlistEntry = { ip: string; comment?: string; status: 'active' | 'inactive' }

// Discriminated by policy: `include`/`value` don't mean the same thing
// for both. A drop-if-filled field is always excluded, with no `include`
// of its own. A pass-if-match field's `value` (what a submission must
// equal to pass) is required, not optional.
export type HiddenFormFieldRule =
  | { fieldName: string; policy: 'drop-if-filled' }
  | { fieldName: string; policy: 'pass-if-match'; value: string; include: boolean }

export type SuriConfig = {
  // Sheet tab / SQLite table name. Undefined/absent means "use the
  // source's own default" (Sheets: the first tab).
  table?: string
  // Widget-facing field name -> actual source column name, both
  // directions. A field not present here is passed through unchanged
  // (its widget-facing name and its real column name are the same).
  fieldMap?: Record<string, string>
  // suri_type 'fastmail' only: who a POST's message goes to
  // (owner-configured, never the submission's own fields) and a fixed
  // subject line.
  recipients?: string[]
  subject?: string
}

// The gateway's own view of a conduit — whatever the pipeline actually
// needs to decide access control, credential lookup, and source
// dispatch, not the full data-model row. Plain and serializable:
// produced by whichever host resolves a curi into one of these (this
// repo's own compiled-YAML projection — see packages/config — or any
// other projection a different GatewayRuntime implementation chooses)
// and handed to this package's router/pipeline already resolved, one
// per request.
export interface ConduitConfig {
  curi: string
  allowlist: AllowlistEntry[]
  racm: string[]
  throttle: boolean
  tokenRequiredMethods: string[]
  bearerTokenHash: string | null
  suriType: string
  suriObjectKey: string
  suriConfig: SuriConfig
  hiddenFormField: HiddenFormFieldRule[]
  // Opaque to this package — never parsed or interpreted here, only
  // handed back to GatewayRuntime.getCredential/invalidateCredential.
  // Only the host that produced this config knows what it means —
  // e.g. a "kind:id" string naming a row in that host's own credential
  // store (see services/gateway's own convention).
  credentialRef: string | null
  // A hosted page for this same curi, resolved by
  // whichever host produced this config exactly like every other field
  // above (a DB row's own JSON column for Cloud's managed Gateway, or
  // simply absent for self-hosted YAML, which doesn't author pages in
  // v1). Optional/nullable, never a separate lookup: dispatch.ts only
  // ever needs `config.presentation`, already sitting alongside
  // suriConfig/hiddenFormField by the time an action runs — no new
  // runtime seam, no database access from this package. Null/undefined
  // both mean "no hosted page" — see content-negotiation.ts.
  presentation?: PageSpec | null
}

export type { GatewayObservation, RouteKind, StatusClass } from './observation.ts'
import type { GatewayObservation } from './observation.ts'
import type { PageSpec } from '@conduits/presentation'
export type { PageSpec } from '@conduits/presentation'

// The one seam this package uses to reach outside itself, implemented
// by whichever host resolved the ConduitConfig it's called with. Every
// method is keyed by curi/config, never by an internal database id, so
// this package never needs to know one exists.
export interface GatewayRuntime {
  getCredential(config: ConduitConfig): Promise<string | null>
  // Called when a source rejects a credential getCredential() already
  // handed out (a revoked Google grant, most commonly) — best-effort
  // cleanup from the runtime's side; the response already sent back to
  // the caller doesn't wait on or change based on this.
  invalidateCredential(config: ConduitConfig): Promise<void>
  // Optional — a runtime that doesn't implement this gets none of the
  // measurement work at all (see dispatch.ts's own dispatch()): no
  // timing, no byte counting, no observation object ever built. A
  // metrics write must never fail the request it's counting — the
  // dispatcher awaits this so an observation is durable (from the
  // runtime's own point of view) before the response goes out, but
  // treats a rejection as best-effort, same as the implementation
  // itself should.
  recordObservation?(observation: GatewayObservation): void | Promise<void>
  // Optional — lets a runtime measure provider-leg bytes without any
  // global mutation. Called once by loadConduitTable
  // (middleware/source-client.ts), right before resolving the
  // credential; the returned fetchImpl is passed straight into
  // ConduitSourceClient.connect()'s own optional third parameter.
  // finish() is called in the same finally block that already calls
  // client.disconnect() — its result is stashed on providerBytesContext
  // for dispatch()'s wrapper to read back once the whole pipeline
  // completes.
  instrumentFetch?(): {
    fetchImpl: typeof fetch
    finish(): { providerRequestBytes: number; providerResponseBytes: number; providerAttempted: boolean }
  }
}
