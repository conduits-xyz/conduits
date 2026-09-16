import type { SuriConfig } from '@conduits/gateway'

// The shared return shape every sources/*.ts compiler produces —
// compile.ts folds this into the rest of a ConduitConfig alongside the
// fields common to every suriType (curi, racm, allowlist, ...).
export interface SourceCompileResult {
  suriObjectKey: string
  suriConfig: SuriConfig
  credentialRef: string
}
