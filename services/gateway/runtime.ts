import { resolveEnvRef, parseGoogleRef, type GooglePurpose } from '@conduits/config'
import type { ConduitConfig, GatewayObservation, GatewayRuntime } from '@conduits/gateway'

import { credentialStorePath, deleteGoogleGrant, getFreshGoogleAccessToken } from '@conduits/credential-store'

// This service's GatewayRuntime. Fastmail tokens come from the
// environment and are replaced by editing it and restarting (see
// server.ts). Google grants are refreshed and invalidated through
// @conduits/credential-store's local file.

function purposeForSuriType(suriType: string): GooglePurpose {
  return suriType === 'gmail' ? 'gmail' : 'sheets'
}

async function getFastmailCredential(config: ConduitConfig): Promise<string | null> {
  if (config.credentialRef == null) return null
  try {
    return resolveEnvRef(config.credentialRef)
  } catch (err) {
    console.error(`[gateway-service] conduit '${config.curi}': ${err instanceof Error ? err.message : err}`)
    return null
  }
}

// Refresh and revocation are @conduits/credential-store's (shared with
// `conduits sheets create`); this adds per-conduit logging.
async function getGoogleCredential(config: ConduitConfig): Promise<string | null> {
  if (config.credentialRef == null) return null

  let name: string
  try {
    name = parseGoogleRef(config.credentialRef)
  } catch (err) {
    console.error(`[gateway-service] conduit '${config.curi}': ${err instanceof Error ? err.message : err}`)
    return null
  }

  const purpose = purposeForSuriType(config.suriType)
  const result = await getFreshGoogleAccessToken(name, purpose)

  switch (result.status) {
    case 'ok':
      return result.accessToken
    case 'missing':
      console.error(
        `[gateway-service] conduit '${config.curi}': no Google credential named '${name}' for purpose '${purpose}' — run: conduits auth google --purpose ${purpose} --name ${name}`,
      )
      return null
    case 'no-refresh-token':
      return null
    case 'revoked':
      console.error(
        `[gateway-service] Google credential '${name}' (${purpose}) was revoked or expired and has been removed — run: conduits auth google --purpose ${purpose} --name ${name}`,
      )
      return null
    case 'refresh-failed':
      console.error(
        `[gateway-service] Google token refresh failed for '${name}' (${purpose}):`,
        result.error instanceof Error ? result.error.message : result.error,
      )
      return null
  }
}

async function getCredential(config: ConduitConfig): Promise<string | null> {
  if (config.suriType === 'googleSheets' || config.suriType === 'gmail') {
    return getGoogleCredential(config)
  }
  return getFastmailCredential(config)
}

// Fastmail: a token from the environment can't be revoked from here, so
// the rejection is logged. Google: a token that looked fresh was
// rejected (a grant revoked elsewhere), so the grant is removed and the
// next request fails with a clear message.
async function invalidateCredential(config: ConduitConfig): Promise<void> {
  if (config.suriType !== 'googleSheets' && config.suriType !== 'gmail') {
    console.error(
      `[gateway-service] credential for conduit '${config.curi}' (${config.suriType}) was rejected — check ${config.credentialRef ?? '(no credentialRef)'} and restart`,
    )
    return
  }
  if (config.credentialRef == null) return
  try {
    const name = parseGoogleRef(config.credentialRef)
    const purpose = purposeForSuriType(config.suriType)
    deleteGoogleGrant(credentialStorePath(), name, purpose)
    console.error(
      `[gateway-service] Google credential '${name}' (${purpose}) was rejected by ${config.suriType} and has been removed — run: conduits auth google --purpose ${purpose} --name ${name}`,
    )
  } catch (err) {
    console.error(`[gateway-service] failed to invalidate credential for conduit '${config.curi}': ${err instanceof Error ? err.message : err}`)
  }
}

// Observations are logged, since there's no database; pipe the logs to
// your log system to keep them. No instrumentFetch, so provider bytes
// aren't measured; the rest (curi, status, latency, client bytes) is.
function recordObservation(observation: GatewayObservation): void {
  console.log(`[gateway-service] ${observation.statusClass} curi=${observation.curi ?? '(unmatched)'}`)
}

export const gatewayServiceRuntime: GatewayRuntime = {
  getCredential,
  invalidateCredential,
  recordObservation,
}
