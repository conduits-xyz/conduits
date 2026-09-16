// Creates a brand-new, blank Google Sheet via the Sheets API itself
// (not the Drive API — no separate Drive call needed, the Sheets API's
// own spreadsheets.create both makes the file and returns its id in
// one round trip).
//
// This is the one way a `drive.file`-scoped grant (see
// packages/config/google-scopes.ts) can end up with a spreadsheet it's
// actually allowed to read/write afterward: `drive.file` only ever
// grants access to a file the authorizing app itself created, or one
// the user explicitly opened through a picker tied to that same OAuth
// client. There's no picker anywhere in this repo — so a spreadsheet
// this CLI didn't itself create is invisible to that scope no matter
// how correct its id is; pasting an existing sheet's id into
// conduits.yaml without having created it through this command first
// will 403/404 on the very first real read or write. `conduits sheets
// create` exists so the spreadsheetId a developer puts in
// conduits.yaml always came from a file this grant can actually see.
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
    // Google's own error body (error.message) is real diagnostic
    // information — surfaced here rather than just the bare status,
    // same reasoning packages/gateway/middleware/source-errors.ts
    // gives for logging a source's own message.
    let detail = ''
    try {
      const body = (await response.json()) as { error?: { message?: string } }
      detail = body.error?.message ? `: ${body.error.message}` : ''
    } catch {
      // Not JSON, or empty — the bare status below is all there is.
    }
    throw new Error(`Failed to create spreadsheet (${response.status})${detail}`)
  }

  const body = (await response.json()) as { spreadsheetId?: string; spreadsheetUrl?: string }
  if (!body.spreadsheetId) throw new Error('Sheets API did not return a spreadsheetId')
  return {
    spreadsheetId: body.spreadsheetId,
    // spreadsheetUrl is documented but not contractually guaranteed on
    // every response shape — this is the same URL Google itself builds
    // it from, so a caller always gets a working link either way.
    url: body.spreadsheetUrl ?? `https://docs.google.com/spreadsheets/d/${body.spreadsheetId}/edit`,
  }
}
