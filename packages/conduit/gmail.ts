import {
  type ConduitSourceClient,
  type ConduitTable,
  type ConduitFieldType,
  type ConduitRecord,
  type ConduitFields,
  ConduitAuthError,
  ConduitSourceError,
} from './sheets.ts'
import { renderEmailBody as renderBody } from './email-render.ts'
import { sendViaSmtp } from './mailpit-test-client.ts'

// Gmail, over the Gmail REST API — send-only. Deliberately narrower
// than Fastmail's own email conduit: no read/archive support (would
// need gmail.readonly/gmail.modify, whose verification tier isn't
// confirmed from public sources), and no "send as" alias picker
// (always the connected account's own primary address, which needs no
// extra scope — Gmail's API sends as the authenticated user by
// default).
const SOURCE = 'gmail'

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

// The whole message template for `POST` — owner-configured in
// suri_config, never taken from a submission's own fields (a public,
// anonymous POST must never control its own destination). See
// ConduitSource.open()'s own doc in sheets.ts: `config` is the
// conduit's whole suri_config, JSON-encoded.
type GmailConfig = {
  recipients?: string[]
  subject?: string
}

function configFrom(config: string | undefined): GmailConfig {
  if (!config) return {}
  try {
    const parsed: unknown = JSON.parse(config)
    return typeof parsed === 'object' && parsed !== null ? (parsed as GmailConfig) : {}
  } catch {
    return {}
  }
}

// Same fixed shape Fastmail's own email conduit describes — real
// documentation value via the /schema endpoint (reachable regardless
// of RACM, see schema-controller.ts) even though `listRecords` itself
// always throws.
const FIXED_FIELDS: Array<{ name: string; type: ConduitFieldType; nullable: boolean }> = [
  { name: 'from', type: 'string', nullable: true },
  { name: 'to', type: 'string', nullable: true },
  { name: 'subject', type: 'string', nullable: true },
  { name: 'body', type: 'string', nullable: true },
  { name: 'date', type: 'date', nullable: true },
]

// A raw RFC 2822 message, base64url-encoded per the Gmail API's own
// `users.messages.send` contract. No explicit `From` header — Gmail
// always sends as the authenticated account's own primary address
// regardless of what a message claims, the same "overwritten server-
// side" behavior Fastmail's JMAP send already has for its own
// identity.
function buildRawMessage(to: string[], subject: string, body: string): string {
  const message = [
    `To: ${to.join(', ')}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\r\n')
  return Buffer.from(message, 'utf8').toString('base64url')
}

// Gmail's own error body (`{ error: { message, status, errors: [...] } }`)
// carries the actual reason a request failed — insufficient scope, the
// Gmail API not enabled for the project, a quota ceiling, etc. Losing
// that behind a bare status code makes a real failure undiagnosable
// from the server log alone (see packages/gateway/middleware/source-errors.ts,
// which logs `ConduitSourceError.message` and nothing else). Best-
// effort: a body that isn't the expected JSON shape just yields ''.
async function gmailErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ? ` — ${body.error.message}` : ''
  } catch {
    return ''
  }
}

function openTable(credential: string, config: GmailConfig): ConduitTable {
  async function requireSendable(): Promise<{ recipients: string[]; subject: string }> {
    if (!config.recipients || config.recipients.length === 0 || !config.subject) {
      throw new ConduitSourceError(SOURCE, 'This conduit has no recipients/subject configured', 502)
    }
    return { recipients: config.recipients, subject: config.subject }
  }

  async function send(fields: ConduitFields): Promise<ConduitRecord> {
    const { recipients, subject } = await requireSendable()
    const raw = buildRawMessage(recipients, subject, renderBody(fields))
    const response = await fetch(SEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    })
    if (response.status === 401) throw new ConduitAuthError(SOURCE, 'Gmail request failed: token rejected (401)')
    if (!response.ok) {
      throw new ConduitSourceError(SOURCE, `Gmail request failed (${response.status})${await gmailErrorDetail(response)}`, response.status)
    }

    const sent = (await response.json()) as { id?: string }
    if (!sent.id) throw new ConduitSourceError(SOURCE, 'Gmail did not return a message id', 502)
    return { id: sent.id, fields }
  }

  return {
    async describeFields() {
      return FIXED_FIELDS
    },

    // Not supported — would need gmail.readonly/gmail.modify scope.
    // Unreachable via RACM (capabilities().methods never offers GET) —
    // this is defense in depth, same reasoning Fastmail's own
    // never-offered methods throw rather than silently no-op.
    async listRecords() {
      throw new ConduitSourceError(SOURCE, 'Gmail conduits only support sending, this phase', 500)
    },

    // Fixed schema — nothing for an owner to add.
    async createField() {
      throw new ConduitSourceError(SOURCE, "Gmail conduits have a fixed schema — there's no field to add", 500)
    },
    async createFields() {
      throw new ConduitSourceError(SOURCE, "Gmail conduits have a fixed schema — there's no field to add", 500)
    },

    async createRecord(fields) {
      return send(fields)
    },
    async createRecords(fieldsList) {
      // No atomic multi-message send — each send is its own independent
      // API call, same reasoning Fastmail's own createRecords has. Same
      // consequence too: capabilities().bulkCreate is false below, so
      // the gateway never actually calls this with more than one entry.
      const records: ConduitRecord[] = []
      for (const fields of fieldsList) records.push(await send(fields))
      return records
    },

    async replaceRecord() {
      throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support replace', 500)
    },
    async replaceRecords() {
      throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support replace', 500)
    },
    async updateRecord() {
      throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support update', 500)
    },
    async updateRecords() {
      throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support update', 500)
    },

    // Not supported — would need gmail.modify scope. Unreachable via
    // RACM (capabilities().methods never offers DELETE) — same defense-
    // in-depth reasoning as listRecords above.
    async deleteRecord() {
      throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support delete, this phase', 500)
    },
    async deleteRecords() {
      throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support delete, this phase', 500)
    },
  }
}

// Exported for its own unit test (mocked fetch, real request/response
// shapes) — NODE_ENV=test always resolves gmailClient itself to the
// Mailpit-backed client below, so this is otherwise unreachable in the
// test environment.
export function createGmailApiClient(): ConduitSourceClient {
  return {
    async connect(_sourceKey, credential) {
      // No account-level session/discovery call needed — the Gmail
      // REST API addresses the authenticated user via the fixed `me`
      // alias, unlike JMAP's own session-discovery handshake. sourceKey
      // is unused (no identity to choose — always the connected
      // account's own primary address). A bad/expired token surfaces
      // as a 401 on the send call itself; no separate validation call
      // to make redundantly here.
      return {
        async listTables() {
          // No tables to choose between (send-only, no read/mailbox
          // concept exposed) — never actually called, since there's
          // no tab/table-selection UI for a send-only source.
          return []
        },
        open(config) {
          return openTable(credential, configFrom(config))
        },
      }
    },
    // Nothing to tear down — plain per-request HTTPS calls, same as
    // Sheets'/Fastmail's own no-op disconnect().
    async disconnect() {},
    capabilities: () => ({ methods: ['POST'], bulkCreate: false }),
  }
}

// Test-only: make the Mailpit-backed client throw ConduitAuthError for
// this credential, simulating a revoked Gmail grant — same role
// sheets.ts's own simulateFakeAuthFailure plays, keyed by credential
// rather than by sourceKey since Gmail's connect() has no sourceKey
// concept (see its own comment above) for a test to address by.
const fakeAuthFailures = new Set<string>()

export function simulateGmailAuthFailure(credential: string): void {
  fakeAuthFailures.add(credential)
}

/** Test-only: clear between tests. */
export function resetGmailAuthFailures(): void {
  fakeAuthFailures.clear()
}

// Test-only: a real Gmail account doesn't exist in tests, and there's
// no Mailpit-equivalent way to fake the Gmail REST API's own shape (see
// gmail.test.ts for that — mocked fetch, same style as fastmail.ts's
// own JMAP-shape test). What Mailpit CAN test for real is the message
// construction/delivery itself: this builds the identical MIME message
// the real path would, then hands it to Mailpit over SMTP — the same
// hand-rolled SMTP client fastmail.ts's own test client uses, shared
// via mailpit-test-client.ts. No REST reads here (unlike Fastmail's
// test client) — Gmail's own read/delete aren't supported, so there's
// nothing to list/remove from Mailpit either.
function createMailpitGmailClient(): ConduitSourceClient {
  return {
    async connect(_sourceKey, credential) {
      return {
        async listTables() {
          return []
        },
        open(config) {
          const parsed = configFrom(config)

          async function send(fields: ConduitFields): Promise<ConduitRecord> {
            if (fakeAuthFailures.has(credential)) {
              throw new ConduitAuthError(SOURCE, 'Gmail request failed: token rejected (401)')
            }
            if (!parsed.recipients || parsed.recipients.length === 0 || !parsed.subject) {
              throw new ConduitSourceError(SOURCE, 'This conduit has no recipients/subject configured', 502)
            }
            await sendViaSmtp(parsed.recipients[0]!, parsed.recipients, parsed.subject, renderBody(fields))
            // Mailpit assigns the real id; a synthetic placeholder here
            // is corrected the moment a caller actually lists/reads —
            // same shape fastmail.ts's own test client uses.
            return { id: '', fields }
          }

          return {
            async describeFields() {
              return FIXED_FIELDS
            },
            async listRecords() {
              throw new ConduitSourceError(SOURCE, 'Gmail conduits only support sending, this phase', 500)
            },
            async createField() {
              throw new ConduitSourceError(SOURCE, "Gmail conduits have a fixed schema — there's no field to add", 500)
            },
            async createFields() {
              throw new ConduitSourceError(SOURCE, "Gmail conduits have a fixed schema — there's no field to add", 500)
            },
            async createRecord(fields) {
              return send(fields)
            },
            async createRecords(fieldsList) {
              const records: ConduitRecord[] = []
              for (const fields of fieldsList) records.push(await send(fields))
              return records
            },
            async replaceRecord() {
              throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support replace', 500)
            },
            async replaceRecords() {
              throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support replace', 500)
            },
            async updateRecord() {
              throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support update', 500)
            },
            async updateRecords() {
              throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support update', 500)
            },
            async deleteRecord() {
              throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support delete, this phase', 500)
            },
            async deleteRecords() {
              throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support delete, this phase', 500)
            },
          }
        },
      }
    },
    async disconnect() {},
    capabilities: () => ({ methods: ['POST'], bulkCreate: false }),
  }
}

export const gmailClient: ConduitSourceClient =
  process.env.NODE_ENV === 'test' ? createMailpitGmailClient() : createGmailApiClient()
