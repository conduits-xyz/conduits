import { buildMessage, messageIdFor } from './message.ts'
import { retryAfterSeconds } from './credentials.ts'
import type { SendResult, Transport } from './types.ts'

export interface GmailTransportOptions {
  // https://gmail.googleapis.com/gmail/v1 in production.
  apiUrl: string
  fetch: typeof fetch
  now: () => number
}

// Gmail's users.messages.send, as the token's account: one request with
// the whole RFC 5322 message. Needs the gmail.send scope.
export function gmailTransport(options: GmailTransportOptions): Transport {
  return {
    async send({ token, from, message, date, makeId }): Promise<SendResult> {
      const raw = buildMessage({ from, message, date, messageId: messageIdFor(makeId(), from), boundary: makeId() })
      let response: Response
      try {
        response = await options.fetch(`${options.apiUrl}/users/me/messages/send`, {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ raw: Buffer.from(raw, 'utf8').toString('base64url') }),
        })
      } catch (error) {
        // The request may have reached Gmail.
        return { ok: false, code: 'outcome_unknown', cause: `Gmail: ${error instanceof Error ? error.message : String(error)}` }
      }
      const body = (await response.json().catch(() => ({}))) as { id?: unknown; error?: { message?: string; errors?: { reason?: string }[] } }
      const cause = `Gmail ${response.status}: ${body.error?.message ?? ''}`
      if (response.ok) return typeof body.id === 'string' ? { ok: true, messageId: body.id } : { ok: false, code: 'outcome_unknown', cause: 'Gmail answered without a message id' }
      if (response.status === 401) return { ok: false, code: 'auth_failed', cause }
      // Google gives rate limits as 429, or as 403 with a *RateLimitExceeded
      // or dailyLimitExceeded reason.
      const limited = response.status === 429 || (body.error?.errors ?? []).some((e) => /RateLimitExceeded$|^dailyLimitExceeded$/.test(e.reason ?? ''))
      if (limited) return { ok: false, code: 'rate_limited', retryAfter: retryAfterSeconds(response.headers.get('retry-after'), options.now()), cause }
      if (response.status === 403) return { ok: false, code: 'auth_failed', cause }
      if (response.status < 500) return { ok: false, code: 'rejected', cause }
      return { ok: false, code: 'outcome_unknown', cause }
    },
  }
}
