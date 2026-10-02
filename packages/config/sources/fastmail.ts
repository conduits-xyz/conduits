import { resolveEnvRef } from '../env.ts'
import type { SourceCompileResult } from '../source-compiler.ts'

// Validates a fastmail `source:` block: FastmailConfig's recipients,
// subject and table (packages/conduit/fastmail.ts), identityId (the
// sending identity, used as sourceKey) and credential (an "env:NAME"
// reference; see env.ts).
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
  // Checks the variable is set without keeping its value;
  // getCredential() reads it per call.
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
