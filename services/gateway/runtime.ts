import { resolveEnvRef, parseGoogleRef, type GooglePurpose } from '@conduits/config'
import type { ConduitConfig, GatewayObservation, GatewayRuntime } from '@conduits/gateway'

import { credentialStorePath, deleteGoogleGrant, getFreshGoogleAccessToken } from '@conduits/credential-store'

// This repo's own `GatewayRuntime` implementation. Fastmail's own
// static API token needs no refresh/revocation at all — an operator
// rotates a dead one by editing their own environment and restarting
// the process (see server.ts: restart-to-reload). Google is the
// opposite: a real, live refresh/invalidation story, backed by
// @conduits/credential-store's local flat-file store instead of a
// database.

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

// Delegates the actual refresh/revocation path to
// @conduits/credential-store (shared with the `conduits sheets create`
// CLI step) — this function only adds the ConduitConfig-shaped,
// per-conduit logging on top.
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

// Fastmail: nothing to invalidate — an env-var-backed credential has
// no live revocation call this process can make; logged so an operator
// piping process logs somewhere still learns their token was rejected.
// Google: a live API call rejected a token that looked fresh by our
// own bookkeeping (a grant revoked out-of-band) — remove it from the
// store so the next request fails fast with a clear message instead of
// retrying a token already known to be dead.
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

// No persistent counters here — there's no database to hold them
// in. Logged instead, so an operator who wants these can pipe process
// logs to whatever they already use for that (journald, a log
// aggregator) — a real, if minimal, answer rather than silently
// dropping them. No instrumentFetch either: this wrapper has no
// byte-accounting relationship with anything, so provider-leg bytes
// stay unmeasured here (recordObservation still gets everything else —
// curi, status, latency, client-leg bytes).
function recordObservation(observation: GatewayObservation): void {
  console.log(`[gateway-service] ${observation.statusClass} curi=${observation.curi ?? '(unmatched)'}`)
}

export const gatewayServiceRuntime: GatewayRuntime = {
  getCredential,
  invalidateCredential,
  recordObservation,
}
