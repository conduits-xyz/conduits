import { parseGoogleRef } from '../google-ref.ts'
import type { SourceCompileResult } from '../source-compiler.ts'

// Validates a `source:` block shaped for suriType 'gmail' — matches
// packages/conduit/gmail.ts's own GmailConfig exactly ({recipients,
// subject}, no `table`: Gmail has no mailbox-selection concept, this
// phase). No identityId field either, unlike Fastmail: gmail.ts's own
// connect() ignores sourceKey entirely (see that file's own comment —
// a Gmail send always goes out as the connected account's own primary
// address, no "send as" choice), so suriObjectKey is simply unused.
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
