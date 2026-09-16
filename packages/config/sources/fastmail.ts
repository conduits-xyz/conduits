import { resolveEnvRef } from '../env.ts'
import type { SourceCompileResult } from '../source-compiler.ts'

// Validates a `source:` block shaped for suriType 'fastmail' — the
// fields here match FastmailConfig in packages/conduit/fastmail.ts
// exactly (recipients/subject/table), plus identityId (that package's
// own suriObjectKey: the JMAP "send as" identity, see that file's own
// comments on fetchSession/connect()) and credential (an "env:NAME"
// reference, never resolved here — see env.ts's own doc on why).
export function compileFastmailSource(raw: unknown, context: string): SourceCompileResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${context}: source must be a map`)
  }
  const source = raw as Record<string, unknown>

  if (typeof source.identityId !== 'string' || source.identityId === '') {
    throw new Error(`${context}: source.identityId is required (the Fastmail JMAP identity id to send as)`)
  }
  if (typeof source.credential !== 'string') {
    throw new Error(`${context}: source.credential is required`)
  }
  // Validates the referenced env var is actually set, without keeping
  // its value anywhere — ConduitConfig.credentialRef stays the opaque
  // "env:NAME" reference; a GatewayRuntime's getCredential()
  // resolves it again, per call.
  resolveEnvRef(source.credential)

  if (!Array.isArray(source.recipients) || source.recipients.length === 0 || !source.recipients.every((r) => typeof r === 'string')) {
    throw new Error(`${context}: source.recipients must be a non-empty list of strings`)
  }
  if (typeof source.subject !== 'string' || source.subject === '') {
    throw new Error(`${context}: source.subject is required`)
  }
  if (source.mailbox !== undefined && typeof source.mailbox !== 'string') {
    throw new Error(`${context}: source.mailbox must be a string`)
  }

  return {
    suriObjectKey: source.identityId,
    suriConfig: {
      recipients: source.recipients as string[],
      subject: source.subject,
      table: source.mailbox as string | undefined,
    },
    credentialRef: source.credential,
  }
}
