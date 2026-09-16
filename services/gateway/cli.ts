import { GOOGLE_AUTHORIZATION_PARAMS, scopesForPurpose, type GooglePurpose } from '@conduits/config'

import { authorizeGoogle } from './google-auth-flow.ts'
import { credentialStorePath, saveGoogleGrant } from './google-credential-store.ts'
import { getFreshGoogleAccessToken, type GoogleTokenResult } from './google-token.ts'
import { createGoogleSheet } from './sheets-create.ts'
import { parseFlags, isGooglePurpose } from './cli-flags.ts'

// Deliberately tiny — this understands exactly three things:
// authorizing Google (the one-time setup step), creating a new Google
// Sheet a `drive.file` grant can actually use (see sheets-create.ts's
// own comment on why that's a separate step, not just "paste an id"),
// and starting the gateway (normal operation). No general-purpose
// conduit-editing commands — conduits are still authored directly in
// conduits.yaml.

async function runAuthGoogle(args: string[]): Promise<void> {
  const flags = parseFlags(args)
  if (!isGooglePurpose(flags.purpose)) {
    throw new Error('auth google requires --purpose sheets|gmail')
  }
  const name = flags.name ?? 'default'

  // Only needed for this one-time step — the running gateway never
  // reads these env vars again (see runtime.ts), since the credential
  // store keeps its own clientId/clientSecret alongside each grant.
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

// Shared with runtime.ts's own getGoogleCredential — same
// GoogleTokenResult, same set of failure reasons, just CLI-styled
// messages (a thrown Error the top-level catch below prints) instead
// of a `[gateway-service]` log line a still-running gateway leaves for
// an operator to notice later.
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
  const flags = parseFlags(args)
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
