// What a caller sends, and what comes back. See README.md.

export interface MailMessage {
  to: string[]
  subject: string
  text: string
  // With html, the message is multipart/alternative: text and HTML.
  html?: string
  replyTo?: string
}

// `cause` is for logs: what the provider said. Callers act on `code`.
export type SendResult =
  | { ok: true; messageId: string }
  // Not sent. The credential was refused; it needs fixing, not a retry.
  | { ok: false; code: 'auth_failed'; cause: string }
  // Not sent. The provider refused this message or sender (a bad
  // address, no matching identity, too large); a retry fails the same way.
  | { ok: false; code: 'rejected'; cause: string }
  // Not sent. The account's sending limit was reached; safe to retry
  // after retryAfter seconds.
  | { ok: false; code: 'rate_limited'; retryAfter: number; cause: string }
  // Not sent. The provider was unreachable or failed before the message
  // was handed over; safe to retry after retryAfter seconds.
  | { ok: false; code: 'unavailable'; retryAfter: number; cause: string }
  // The message was handed over and the answer was lost or was a server
  // error: it may have been sent. Retrying can send it twice.
  | { ok: false; code: 'outcome_unknown'; cause: string }

export type SendFailure = Exclude<SendResult, { ok: true }>

export interface MailSender {
  send(message: MailMessage): Promise<SendResult>
}

// A bearer token for the account, or why there is none.
export type TokenResult =
  | { ok: true; token: string }
  | Extract<SendFailure, { code: 'auth_failed' | 'unavailable' }>

export interface Credential {
  token(): Promise<TokenResult>
  // The provider refused the last token: get a new one next time.
  forget(): void
}

export interface SendingAccount {
  // The From address. JMAP sends as the account's identity with this
  // address. Gmail sends as the token's account; without `from` it uses
  // that account's primary address.
  from?: string
  credential: Credential
}

export interface TransportSend {
  token: string
  from: string | undefined
  message: MailMessage
  // The instant the message is sent at, for its Date header.
  date: Date
  // For the Message-ID header and a MIME boundary.
  makeId: () => string
}

export interface Transport {
  send(input: TransportSend): Promise<SendResult>
}

// When a provider says to wait but not for how long.
export const DEFAULT_RETRY_AFTER_SECONDS = 30
