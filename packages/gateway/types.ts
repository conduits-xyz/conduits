export type AllowlistEntry = { ip: string; comment?: string; status: 'active' | 'inactive' }

// By policy: a drop-if-filled field is always excluded and has no
// `include`; a pass-if-match field requires `value`, which a submission
// must equal.
export type HiddenFormFieldRule =
  | { fieldName: string; policy: 'drop-if-filled' }
  | { fieldName: string; policy: 'pass-if-match'; value: string; include: boolean }

// A scoped API key as enforcement sees it: no plaintext, no holder.
export type ApiKeyRef = {
  // The host's id for the key, used only to attribute usage.
  id?: number
  tokenHash: string
  scopes: string[]
}

export type SuriConfig = {
  // Sheet tab or table name. Absent means the source's default (Sheets:
  // the first tab).
  table?: string
  // Field name -> source column name, used both ways. Fields not listed
  // use the same name.
  fieldMap?: Record<string, string>
  // suri_type 'fastmail' only: the owner-set recipients and subject of
  // a POST's message.
  recipients?: string[]
  subject?: string
}

// A conduit as the gateway needs it: access control, credential lookup
// and source dispatch. Plain data, resolved by the host (packages/config
// for YAML, or another GatewayRuntime's projection) and passed in per
// request.
export interface ConduitConfig {
  curi: string
  allowlist: AllowlistEntry[]
  racm: string[]
  throttle: boolean
  tokenRequiredMethods: string[]
  // A token-required method is allowed for a request presenting any key
  // whose scopes include it.
  apiKeys: ApiKeyRef[]
  suriType: string
  suriObjectKey: string
  suriConfig: SuriConfig
  hiddenFormField: HiddenFormFieldRule[]
  // Opaque here; only passed back to GatewayRuntime.getCredential and
  // invalidateCredential. The host defines it, e.g. a "kind:id" naming
  // an entry in its credential store.
  credentialRef: string | null
}

export type { GatewayObservation, RouteKind, StatusClass } from './observation.ts'
import type { GatewayObservation } from './observation.ts'

// What this package needs from its host, implemented by whoever resolved
// the ConduitConfig. Keyed by curi or config, never by a database id.
export interface GatewayRuntime {
  getCredential(config: ConduitConfig): Promise<string | null>
  // Called when a source rejects a credential getCredential returned
  // (most often a revoked Google grant). Cleanup only; the response
  // doesn't wait on it.
  invalidateCredential(config: ConduitConfig): Promise<void>
  // Optional. Without it, dispatch() skips all measurement. dispatch()
  // awaits it so the observation is recorded before responding, but a
  // rejection doesn't fail the request.
  recordObservation?(observation: GatewayObservation): void | Promise<void>
  // Optional: measures provider bytes without global state.
  // loadConduitTable (middleware/source-client.ts) calls it before
  // resolving the credential and passes fetchImpl to
  // ConduitSourceClient.connect(). finish() runs beside disconnect(),
  // and its result goes on providerBytesContext for dispatch() to read.
  instrumentFetch?(): {
    fetchImpl: typeof fetch
    finish(): { providerRequestBytes: number; providerResponseBytes: number; providerAttempted: boolean }
  }
}
