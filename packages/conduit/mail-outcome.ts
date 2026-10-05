import type { SendFailure } from '@m5nv/mail'

import { ConduitAuthError, ConduitRateLimitError, ConduitSourceError } from './sheets.ts'

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
