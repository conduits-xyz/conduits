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

// Gmail over its REST API, send-only. No reading or archiving (those
// need the gmail.readonly or gmail.modify scopes) and no alias picker:
// Gmail sends as the account's primary address, which needs no extra
// scope.
const SOURCE = 'gmail'

const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send'

// The message template for POST, set by the owner in suri_config and
// never taken from a submission. `config` is the suri_config JSON (see
// ConduitSource.open() in sheets.ts).
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

// The fixed fields, as for Fastmail, shown by /schema (which ignores
// RACM; see schema-controller.ts) though listRecords always throws.
const FIXED_FIELDS: Array<{ name: string; type: ConduitFieldType; nullable: boolean }> = [
  { name: 'from', type: 'string', nullable: true },
  { name: 'to', type: 'string', nullable: true },
  { name: 'subject', type: 'string', nullable: true },
  { name: 'body', type: 'string', nullable: true },
  { name: 'date', type: 'date', nullable: true },
]

// An RFC 2822 message, base64url-encoded for users.messages.send. No
// From header: Gmail always sends as the account's primary address.
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

// The reason from Gmail's error body ({ error: { message, status,
// errors } }), such as a missing scope or quota, since
// source-errors.ts logs only the error message. '' when the body isn't
// that shape.
async function gmailErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message ? ` — ${body.error.message}` : ''
  } catch {
    return ''
  }
}

function openTable(credential: string, config: GmailConfig, fetchImpl: typeof fetch = fetch): ConduitTable {
  async function requireSendable(): Promise<{ recipients: string[]; subject: string }> {
    if (!config.recipients || config.recipients.length === 0 || !config.subject) {
      throw new ConduitSourceError(SOURCE, 'This conduit has no recipients/subject configured', 502)
    }
    return { recipients: config.recipients, subject: config.subject }
  }

  async function send(fields: ConduitFields): Promise<ConduitRecord> {
    const { recipients, subject } = await requireSendable()
    const raw = buildRawMessage(recipients, subject, renderBody(fields))
    const response = await fetchImpl(SEND_URL, {
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

    // Reading needs gmail.readonly or gmail.modify.
    // capabilities().methods doesn't offer GET; this throws in case it is
    // called anyway.
    async listRecords() {
      throw new ConduitSourceError(SOURCE, 'Gmail conduits only support sending, this phase', 500)
    },

    // Fixed schema: nothing for an owner to add.
    async createField() {
      throw new ConduitSourceError(SOURCE, "Gmail conduits have a fixed schema — there's no field to add", 500)
    },
    async createFields() {
      throw new ConduitSourceError(SOURCE, "Gmail conduits have a fixed schema — there's no field to add", 500)
    },
    async deleteField() {
      throw new ConduitSourceError(SOURCE, "Gmail conduits have a fixed schema — there's no field to remove", 500)
    },
    async deleteFields() {
      throw new ConduitSourceError(SOURCE, "Gmail conduits have a fixed schema — there's no field to remove", 500)
    },

    async createRecord(fields) {
      return send(fields)
    },
    async createRecords(fieldsList) {
      // Each send is a separate API call, as in Fastmail, so
      // capabilities().bulkCreate is false.
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

    // Needs gmail.modify. capabilities().methods doesn't offer DELETE.
    async deleteRecord() {
      throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support delete, this phase', 500)
    },
    async deleteRecords() {
      throw new ConduitSourceError(SOURCE, 'Gmail conduits do not support delete, this phase', 500)
    },
  }
}

// Exported for its unit test; under NODE_ENV=test gmailClient is the
// Mailpit-backed client below.
export function createGmailApiClient(): ConduitSourceClient {
  return {
    async connect(_sourceKey, credential, fetchImpl = fetch) {
      // No session call: the API addresses the user as `me`. sourceKey
      // is unused. A bad token shows up as a 401 on send.
      return {
        async listTables() {
          // Send-only: there are no tables.
          return []
        },
        open(config) {
          return openTable(credential, configFrom(config), fetchImpl)
        },
      }
    },
    // Nothing to close: each call is a separate HTTPS request.
    async disconnect() {},
    capabilities: () => ({ methods: ['POST'], bulkCreate: false }),
  }
}

// For tests: makes the Mailpit-backed client throw ConduitAuthError for
// this credential, as for a revoked grant. Keyed by credential, since
// Gmail has no sourceKey.
const fakeAuthFailures = new Set<string>()

export function simulateGmailAuthFailure(credential: string): void {
  fakeAuthFailures.add(credential)
}

/** For tests: clears the simulated failures. */
export function resetGmailAuthFailures(): void {
  fakeAuthFailures.clear()
}

// For tests: builds the same MIME message as the real client and sends
// it to Mailpit over SMTP (mailpit-test-client.ts). The Gmail API calls
// themselves are tested with a mocked fetch in gmail.test.ts.
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
            // Mailpit assigns the id; this placeholder stands in.
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
            async deleteField() {
              throw new ConduitSourceError(SOURCE, "Gmail conduits have a fixed schema — there's no field to remove", 500)
            },
            async deleteFields() {
              throw new ConduitSourceError(SOURCE, "Gmail conduits have a fixed schema — there's no field to remove", 500)
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
