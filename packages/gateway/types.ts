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
}

export type GatewayEvent =
  | { type: 'hit'; curi: string }
  | { type: 'honeypot'; curi: string }

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
  // A metrics write must never fail the request it's counting — every
  // call site here awaits this so a count is durable before the
  // response goes out, but treats a rejection as best-effort, same as
  // the implementation itself should.
  recordEvent(event: GatewayEvent): void | Promise<void>
}
