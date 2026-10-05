import { createGmailClient, createGoogleSheetsClient, createFastmailClient, type ConduitSourceClient, type GoogleSheetsClientOptions } from '@conduits/conduit'
import { randomUUID } from 'node:crypto'
import type { GoogleTokenOptions } from '@conduits/credential-store'

// The providers this service talks to, and the clients it builds for
// them. Every provider URL the service uses is here; the packages take
// theirs from the caller.

export const GOOGLE_ENDPOINTS = {
  authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenUrl: 'https://oauth2.googleapis.com/token',
  userinfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
  sheetsApiUrl: 'https://sheets.googleapis.com/v4/spreadsheets',
  gmailApiUrl: 'https://gmail.googleapis.com/gmail/v1',
} as const

export const FASTMAIL_SESSION_URL = 'https://api.fastmail.com/jmap/session'

export function createSourceClients(sheets: Pick<GoogleSheetsClientOptions, 'readCacheMs' | 'budget'>): Record<string, ConduitSourceClient> {
  return {
    googleSheets: createGoogleSheetsClient({ apiUrl: GOOGLE_ENDPOINTS.sheetsApiUrl, fetch, now: Date.now, ...sheets }),
    gmail: createGmailClient({ apiUrl: GOOGLE_ENDPOINTS.gmailApiUrl, fetch, now: Date.now, makeId: randomUUID }),
    fastmail: createFastmailClient({ sessionUrl: FASTMAIL_SESSION_URL, fetch, now: Date.now, makeId: randomUUID }),
  }
}

export const googleTokenOptions: GoogleTokenOptions = {
  endpoint: { tokenUrl: GOOGLE_ENDPOINTS.tokenUrl, fetch },
  now: Date.now,
}
