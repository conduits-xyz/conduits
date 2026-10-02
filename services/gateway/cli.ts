import { GOOGLE_AUTHORIZATION_PARAMS, scopesForPurpose, type GooglePurpose } from '@conduits/config'

import { authorizeGoogle } from './google-auth-flow.ts'
import { credentialStorePath, saveGoogleGrant, getFreshGoogleAccessToken, type GoogleTokenResult } from '@conduits/credential-store'
import { createGoogleSheet } from './sheets-create.ts'
import { parseFlags, isGooglePurpose } from './cli-flags.ts'

// Three commands: authorize Google (once), create a Google Sheet a
// drive.file grant can use (see sheets-create.ts), and start the
// gateway. Conduits are edited in conduits.yaml.

async function runAuthGoogle(args: string[]): Promise<void> {
  const flags = parseFlags(args, ['purpose', 'name'])
  if (!isGooglePurpose(flags.purpose)) {
    throw new Error('auth google requires --purpose sheets|gmail')
  }
  const name = flags.name ?? 'default'

  // Needed only here; the store keeps clientId and clientSecret with
  // each grant (see runtime.ts).
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId) {
    throw new Error(
      'GOOGLE_CLIENT_ID is required for this one-time authorization step (create a "Desktop app" OAuth client in Google Cloud Console — see README.md).',
    )
  }

  const { tokens, email } = await authorizeGoogle({
    clientId,
    clientSecret,
    scopes: scopesForPurpose(flags.purpose),
    authorizationParams: { ...GOOGLE_AUTHORIZATION_PARAMS },
  })

  const storePath = credentialStorePath()
  saveGoogleGrant(storePath, { name, purpose: flags.purpose, clientId, clientSecret, tokens })

  console.log(`\nAuthorized${email ? ` as ${email}` : ''} for purpose '${flags.purpose}'.`)
  console.log(`Saved to ${storePath}.`)
  console.log(`\nUse this in conduits.yaml:\n\n  credential: google:${name}\n`)
}

// The same GoogleTokenResult handling as getGoogleCredential in
// runtime.ts, with errors for the command line instead of log lines.
function accessTokenOrThrow(result: GoogleTokenResult, name: string, purpose: GooglePurpose): string {
  switch (result.status) {
    case 'ok':
      return result.accessToken
    case 'missing':
    case 'no-refresh-token':
      throw new Error(`No Google credential named '${name}' for purpose '${purpose}' — run: conduits auth google --purpose ${purpose} --name ${name}`)
    case 'revoked':
      throw new Error(
        `Google credential '${name}' (${purpose}) was revoked or expired and has been removed — run: conduits auth google --purpose ${purpose} --name ${name}`,
      )
    case 'refresh-failed':
      throw new Error(`Google token refresh failed for '${name}' (${purpose}): ${result.error instanceof Error ? result.error.message : result.error}`)
  }
}

async function runSheetsCreate(args: string[]): Promise<void> {
  const flags = parseFlags(args, ['name', 'title'])
  const name = flags.name ?? 'default'
  const title = flags.title ?? `Conduits — ${name}`

  const result = await getFreshGoogleAccessToken(name, 'sheets')
  const accessToken = accessTokenOrThrow(result, name, 'sheets')

  const { spreadsheetId, url } = await createGoogleSheet(accessToken, title)

  console.log(`\nCreated "${title}".`)
  console.log(url)
  console.log(`\nUse this in conduits.yaml:\n\n  spreadsheetId: ${spreadsheetId}\n`)
}

async function runGateway(): Promise<void> {
  await import('./server.ts')
}

async function main(): Promise<void> {
  const [command, subcommand, ...rest] = process.argv.slice(2)

  if (command === 'auth' && subcommand === 'google') {
    await runAuthGoogle(rest)
    return
  }
  if (command === 'sheets' && subcommand === 'create') {
    await runSheetsCreate(rest)
    return
  }
  if (command === 'gateway') {
    await runGateway()
    return
  }

  console.error('Usage:')
  console.error('  conduits auth google --purpose <sheets|gmail> --name <name>')
  console.error('  conduits sheets create --name <name> [--title <title>]')
  console.error('  conduits gateway')
  process.exitCode = 1
}

try {
  await main()
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : err}`)
  process.exitCode = 1
}
