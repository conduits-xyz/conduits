import type { SendFailure } from '@m5nv/mail'

import { ConduitAuthError, ConduitRateLimitError, ConduitSourceError, type ConduitFieldType } from './sheets.ts'

// What the Gmail and Fastmail sources share.

// A mail conduit's fields, shown by /schema (which ignores RACM; see
// schema-controller.ts in @conduits/gateway).
export const MAIL_FIELDS: Array<{ name: string; type: ConduitFieldType; nullable: boolean }> = [
  { name: 'from', type: 'string', nullable: true },
  { name: 'to', type: 'string', nullable: true },
  { name: 'subject', type: 'string', nullable: true },
  { name: 'body', type: 'string', nullable: true },
  { name: 'date', type: 'date', nullable: true },
]

// The recipients and subject a send needs, which the owner sets.
export function sendAddressing(source: string, config: { recipients?: string[]; subject?: string }): { recipients: string[]; subject: string } {
  if (!config.recipients || config.recipients.length === 0 || !config.subject) {
    throw new ConduitSourceError(source, 'This conduit has no recipients/subject configured', 502)
  }
  return { recipients: config.recipients, subject: config.subject }
}

// A failed @m5nv/mail call (a send, or a JMAP account lookup) as the
// conduit error the gateway maps: a refused credential reconnects; a
// call that is safe to retry is busy, with its Retry-After; anything
// else is a 502 without one, since a message whose outcome is unknown
// must not be sent again.
export function mailFailureError(source: string, failure: SendFailure): Error {
  switch (failure.code) {
    case 'auth_failed':
      return new ConduitAuthError(source, `Credential refused: ${failure.cause}`)
    case 'rate_limited':
    case 'unavailable':
      return new ConduitRateLimitError(source, `Not attempted (${failure.code}): ${failure.cause}`, failure.retryAfter)
    case 'rejected':
      return new ConduitSourceError(source, `Rejected: ${failure.cause}`, 502)
    case 'outcome_unknown':
      return new ConduitSourceError(source, `Send outcome unknown: ${failure.cause}`, 502)
  }
}
