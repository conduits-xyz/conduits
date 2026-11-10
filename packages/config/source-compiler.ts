import type { SuriConfig } from '@conduits/gateway'

// What each sources/*.ts compiler returns; compile.ts adds the fields
// every suriType has (curi, racm, allowlist, ...).
export interface SourceCompileResult {
  suriObjectKey: string
  suriConfig: SuriConfig
  credentialRef: string
}
