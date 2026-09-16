// The single source of truth for what a Google-backed conduit
// requests for each purpose — exported so any runtime importing
// `@conduits/config` shares the same scopes rather than keeping its
// own separate literals; this repo's own `conduits auth google` flow
// (services/gateway/cli.ts) imports these constants directly.
export const GOOGLE_SHEETS_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'] as const

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'openid', 'email'] as const

// access_type: 'offline' is what makes Google issue a refresh token at
// all; prompt: 'consent' forces the consent screen even on a repeat
// authorization, which is the only reliable way to get a *new* refresh
// token if an old one was lost (Google only returns one on first
// consent otherwise).
export const GOOGLE_AUTHORIZATION_PARAMS = { access_type: 'offline', prompt: 'consent' } as const

export type GooglePurpose = 'sheets' | 'gmail'

export function scopesForPurpose(purpose: GooglePurpose): readonly string[] {
  return purpose === 'gmail' ? GMAIL_SCOPES : GOOGLE_SHEETS_SCOPES
}

// Google's own, stable wording for a refresh token that will never work
// again — a revoked grant, a changed password (Gmail-scoped grants),
// six months of disuse, or (a Testing-status OAuth project) a 7-day
// expiry all collapse to this same response: { error: 'invalid_grant',
// error_description: 'Token has been expired or revoked.' } — and
// remix/auth's own token-refresh internals prefer error_description
// over the bare error code when building the thrown Error's message,
// so this exact string is what surfaces, not the shorter 'invalid_grant'
// code alone. Shared so any runtime's own refresh logic — this repo's
// own (services/gateway/runtime.ts) included — recognizes the exact
// same signal for "this grant is dead, stop retrying it" — confirmed
// live against Google's own documented OAuth error shape, not guessed.
export const GOOGLE_REVOKED_GRANT_MESSAGE = 'Token has been expired or revoked.'
