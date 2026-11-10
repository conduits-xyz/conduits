import { resolveEnvRef, parseGoogleRef, type GooglePurpose, type PlatformEnvironment } from '@conduits/config'
import type { ConduitConfig, GatewayObservation, GatewayRuntime } from '@conduits/gateway'

import { deleteGoogleGrant, getFreshGoogleAccessToken, loadGoogleGrant, type GoogleTokenOptions } from '@conduits/credential-store'

import { grantRemovedMessage, noGrantMessage } from './commands.ts'

// This service's GatewayRuntime. Fastmail tokens come from the
// environment and are replaced by editing it and restarting (see
// server.ts). Google grants are refreshed and invalidated through
// @conduits/credential-store's local file.

// Google Sheets and Gmail conduits use a Google grant; Fastmail, a token.
const isGoogleSource = (suriType: string) => suriType === 'googleSheets' || suriType === 'gmail'

function purposeForSuriType(suriType: string): GooglePurpose {
  return suriType === 'gmail' ? 'gmail' : 'sheets'
}

async function getFastmailCredential(config: ConduitConfig, platform: PlatformEnvironment): Promise<string | null> {
  if (config.credentialRef == null) return null
  try {
    return resolveEnvRef(platform, config.credentialRef)
  } catch (err) {
    console.error(`[gateway-service] conduit '${config.curi}': ${err instanceof Error ? err.message : err}`)
    return null
  }
}

// Refresh and revocation are @conduits/credential-store's (shared with
// `npm run sheets:create`); this adds per-conduit logging.
async function getGoogleCredential(config: ConduitConfig, storePath: string, google: GoogleTokenOptions): Promise<string | null> {
  if (config.credentialRef == null) return null

  let name: string
  try {
    name = parseGoogleRef(config.credentialRef)
  } catch (err) {
    console.error(`[gateway-service] conduit '${config.curi}': ${err instanceof Error ? err.message : err}`)
    return null
  }

  const purpose = purposeForSuriType(config.suriType)
  const result = await getFreshGoogleAccessToken(storePath, name, purpose, google)

  switch (result.status) {
    case 'ok':
      return result.accessToken
    case 'missing':
      console.error(`[gateway-service] conduit '${config.curi}': ${noGrantMessage(name, purpose)}`)
      return null
    case 'no-refresh-token':
      return null
    case 'revoked':
      console.error(`[gateway-service] ${grantRemovedMessage(name, purpose, 'was revoked or expired')}`)
      return null
    case 'refresh-failed':
      console.error(
        `[gateway-service] Google token refresh failed for '${name}' (${purpose}):`,
        result.error.message,
      )
      return null
  }
}


// Fastmail: a token from the environment can't be revoked from here, so
// the rejection is logged. Google: a token that looked fresh was
// rejected (a grant revoked elsewhere), so the grant is removed and the
// next request fails with a clear message.
async function invalidateCredential(config: ConduitConfig, storePath: string): Promise<void> {
  if (!isGoogleSource(config.suriType)) {
    console.error(
      `[gateway-service] credential for conduit '${config.curi}' (${config.suriType}) was rejected — check ${config.credentialRef ?? '(no credentialRef)'} and restart`,
    )
    return
  }
  if (config.credentialRef == null) return
  try {
    const name = parseGoogleRef(config.credentialRef)
    const purpose = purposeForSuriType(config.suriType)
    deleteGoogleGrant(storePath, name, purpose)
    console.error(`[gateway-service] ${grantRemovedMessage(name, purpose, `was rejected by ${config.suriType}`)}`)
  } catch (err) {
    console.error(`[gateway-service] failed to invalidate credential for conduit '${config.curi}': ${err instanceof Error ? err.message : err}`)
  }
}

// At startup: what each Google conduit is missing in the credential
// store, so a person learns before the first request fails with 502.
// Empty when every grant is there. compileConduits has already checked
// each reference's form.
export function missingGoogleGrants(configs: Iterable<ConduitConfig>, storePath: string): string[] {
  const missing: string[] = []
  for (const config of configs) {
    if (!isGoogleSource(config.suriType) || config.credentialRef == null) continue
    const purpose = purposeForSuriType(config.suriType)
    const name = parseGoogleRef(config.credentialRef)
    if (!loadGoogleGrant(storePath, name, purpose)) missing.push(`conduit '${config.curi}': ${noGrantMessage(name, purpose)}`)
  }
  return missing
}

// Observations are logged, since there's no database; pipe the logs to
// your log system to keep them. No instrumentFetch, so provider bytes
// aren't measured; the rest (curi, status, latency, client bytes) is.
function recordObservation(observation: GatewayObservation): void {
  console.log(`[gateway-service] ${observation.statusClass} curi=${observation.curi ?? '(unmatched)'}`)
}

// Google grants are stored at `storePath` (credentialStorePath in
// config.ts) and refreshed at `google`'s token endpoint, on its clock
// (providers.ts). Fastmail tokens are read from `platform`.
export function createGatewayServiceRuntime(storePath: string, google: GoogleTokenOptions, platform: PlatformEnvironment): GatewayRuntime {
  return {
    getCredential: (config) =>
      isGoogleSource(config.suriType) ? getGoogleCredential(config, storePath, google) : getFastmailCredential(config, platform),
    invalidateCredential: (config) => invalidateCredential(config, storePath),
    recordObservation,
  }
}
