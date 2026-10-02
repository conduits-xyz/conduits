// Creates a blank Google Sheet with spreadsheets.create, which returns
// its id in the same call.
//
// The drive.file scope (packages/config/google-scopes.ts) covers only
// files the app created or the user opened through the app's picker.
// This repo has no picker, so a sheet must be created with `conduits
// sheets create`; another sheet's id in conduits.yaml gets 403 or 404
// on first use.
const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'

export interface CreatedSheet {
  spreadsheetId: string
  url: string
}

export async function createGoogleSheet(accessToken: string, title: string): Promise<CreatedSheet> {
  const response = await fetch(SHEETS_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: { title } }),
  })

  if (!response.ok) {
    // Include Google's error.message, which says what went wrong.
    let detail = ''
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      detail = body.error?.message ? `: ${body.error.message}` : ''
    } catch {
      // Empty or not JSON: only the status remains.
    }
    throw new Error(`Failed to create spreadsheet (${response.status})${detail}`)
  }

  const body = (await response.json()) as { spreadsheetId?: string; spreadsheetUrl?: string }
  if (!body.spreadsheetId) throw new Error('Sheets API did not return a spreadsheetId')
  return {
    spreadsheetId: body.spreadsheetId,
    // spreadsheetUrl isn't guaranteed in every response; this builds the
    // same URL.
    url: body.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${body.spreadsheetId}/edit`,
  }
}
