// The Google scopes for each purpose, shared by every runtime that
// imports @conduits/config, including `conduits auth google`
// (services/gateway/cli.ts).
export const GOOGLE_SHEETS_SCOPES = ['https://www.googleapis.com/auth/drive.file', 'openid', 'email'] as const

export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'openid', 'email'] as const

// access_type 'offline' makes Google issue a refresh token. prompt
// 'consent' shows the consent screen every time, which is the only way
// to get a new refresh token after losing one.
export const GOOGLE_AUTHORIZATION_PARAMS = { access_type: 'offline', prompt: 'consent' } as const

export type GooglePurpose = 'sheets' | 'gmail'

export function scopesForPurpose(purpose: GooglePurpose): readonly string[] {
  return purpose === 'gmail' ? GMAIL_SCOPES : GOOGLE_SHEETS_SCOPES
}

// The message for a refresh token that will never work again: revoked,
// a changed password (Gmail scopes), six months unused, or the 7-day
// limit of a Testing-status project all return { error:
// 'invalid_grant', error_description: 'Token has been expired or
// revoked.' }, and remix/auth puts error_description in the thrown
// Error's message. Runtimes compare against this to stop retrying a
// dead grant.
export const GOOGLE_REVOKED_GRANT_MESSAGE = 'Token has been expired or revoked.'
