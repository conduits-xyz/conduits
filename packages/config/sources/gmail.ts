import { parseGoogleRef } from '../google-ref.ts'
import type { SourceCompileResult } from '../source-compiler.ts'

// Validates a gmail `source:` block: GmailConfig's recipients and
// subject (packages/conduit/gmail.ts). No table and no identityId:
// Gmail sends as the account's primary address and ignores sourceKey.
export function compileGmailSource(raw: unknown, context: string): SourceCompileResult {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error(`${context}: source must be a map`)
  }
  const source = raw as Record<string, unknown>

  if (typeof source.credential !== 'string') {
    throw new Error(`${context}: source.credential is required`)
  }
  parseGoogleRef(source.credential)

  if (!Array.isArray(source.recipients) || source.recipients.length === 0 || !source.recipients.every((r) => typeof r === 'string')) {
    throw new Error(`${context}: source.recipients must be a non-empty list of strings`)
  }
  if (typeof source.subject !== 'string' || source.subject === '') {
    throw new Error(`${context}: source.subject is required`)
  }

  return {
    suriObjectKey: '',
    suriConfig: { recipients: source.recipients as string[], subject: source.subject },
    credentialRef: source.credential,
  }
}
