import { GOOGLE_AUTHORIZATION_PARAMS, resolveEnvRef, scopesForPurpose, type GooglePurpose } from '@conduits/config'
import { listFastmailIdentities } from '@conduits/conduit'

import { authorizeGoogle } from './google-auth-flow.ts'
import { saveGoogleGrant, getFreshGoogleAccessToken, type GoogleTokenResult } from '@conduits/credential-store'
import { credentialStorePath } from './config.ts'
import { createGoogleSheet } from './sheets-create.ts'
import { parseFlags, isGooglePurpose } from './cli-flags.ts'
import { FASTMAIL_SESSION_URL, GOOGLE_ENDPOINTS, googleTokenOptions } from './providers.ts'
import { USAGE, grantRemovedMessage, noGrantMessage } from './commands.ts'

// The command's composition root: the only code that reads the platform
// environment.
const platform = process.env

// Four commands: authorize Google (once), create a Google Sheet a
// drive.file grant can use (see sheets-create.ts), list a Fastmail
// account's identities, and start the gateway. Conduits are edited in
// conduits.yaml.

async function runAuthGoogle(args: string[]): Promise<void> {
  const flags = parseFlags(args, ['purpose', 'name'])
  if (!isGooglePurpose(flags.purpose)) {
    throw new Error('npm run auth:google requires --purpose sheets|gmail')
  }
  const name = flags.name ?? 'default'

  // Needed only here; the store keeps clientId and clientSecret with
  // each grant (see runtime.ts).
  const clientId = platform.GOOGLE_CLIENT_ID
  const clientSecret = platform.GOOGLE_CLIENT_SECRET
  if (!clientId) {
    throw new Error(
      'GOOGLE_CLIENT_ID is required for this one-time authorization step (create a "Desktop app" OAuth client in Google Cloud Console — see README.md).',
    )
  }

  const { tokens, email } = await authorizeGoogle({
    endpoints: { ...GOOGLE_ENDPOINTS, fetch },
    now: Date.now,
    clientId,
    clientSecret,
    scopes: scopesForPurpose(flags.purpose),
    authorizationParams: { ...GOOGLE_AUTHORIZATION_PARAMS },
  })

  const storePath = credentialStorePath(platform)
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
      throw new Error(noGrantMessage(name, purpose))
    case 'revoked':
      throw new Error(grantRemovedMessage(name, purpose, 'was revoked or expired'))
    case 'refresh-failed':
      throw new Error(`Google token refresh failed for '${name}' (${purpose}): ${result.error.message}`)
  }
}

async function runSheetsCreate(args: string[]): Promise<void> {
  const flags = parseFlags(args, ['name', 'title'])
  const name = flags.name ?? 'default'
  const title = flags.title ?? `Conduits — ${name}`

  const result = await getFreshGoogleAccessToken(credentialStorePath(platform), name, 'sheets', googleTokenOptions)
  const accessToken = accessTokenOrThrow(result, name, 'sheets')

  const { spreadsheetId, url } = await createGoogleSheet({ apiUrl: GOOGLE_ENDPOINTS.sheetsApiUrl, fetch }, accessToken, title)

  console.log(`\nCreated "${title}".`)
  console.log(url)
  console.log(`\nUse this in conduits.yaml:\n\n  spreadsheetId: ${spreadsheetId}\n`)
}

// The identities a Fastmail API token can send as, and the line for
// conduits.yaml. The token is named as in conduits.yaml, env:NAME, so it
// is read from .env and never typed on the command line.
async function runFastmailIdentities(args: string[]): Promise<void> {
  const flags = parseFlags(args, ['credential'])
  if (!flags.credential) throw new Error('npm run fastmail:identities requires --credential env:<NAME>, the .env variable that holds the API token')
  const token = resolveEnvRef(platform, flags.credential)
  const identities = await listFastmailIdentities({ sessionUrl: FASTMAIL_SESSION_URL, fetch, now: Date.now }, token)
  if (identities.length === 0) {
    console.log('This Fastmail account has no identity to send as.')
    return
  }
  for (const identity of identities) console.log(`${identity.id}  ${identity.email}${identity.name ? `  ${identity.name}` : ''}`)
  console.log(`\nUse one in conduits.yaml, for example:\n\n  identityId: ${identities[0]!.id}\n`)
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
  if (command === 'fastmail' && subcommand === 'identities') {
    await runFastmailIdentities(rest)
    return
  }
  if (command === 'gateway') {
    await runGateway()
    return
  }

  console.error('Usage:')
  for (const line of USAGE) console.error(`  ${line}`)
  process.exitCode = 1
}

try {
  await main()
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : err}`)
  process.exitCode = 1
}
