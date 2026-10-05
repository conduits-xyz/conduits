import {
  type ConduitSourceCapabilities,
  type ConduitSourceClient,
  type ConduitTable,
  type ConduitFieldType,
  type ConduitRecord,
  type ConduitFields,
  ConduitSourceError,
} from './sheets.ts'
import { createMailSender, fixedToken, gmailTransport } from '@m5nv/mail'
import { renderEmailBody as renderBody } from './email-render.ts'
import { mailFailureError } from './mail-outcome.ts'

export const GMAIL_CAPABILITIES: ConduitSourceCapabilities = { methods: ['POST'], bulkCreate: false }

// Gmail over its REST API, send-only. No reading or archiving (those
// need the gmail.readonly or gmail.modify scopes) and no alias picker:
// Gmail sends as the account's primary address, which needs no extra
// scope.
const SOURCE = 'gmail'

// Where and how the client reaches the Gmail API, and the clock and id
// source for each message's Date and Message-ID.
export interface GmailClientOptions {
  // For example https://gmail.googleapis.com/gmail/v1.
  apiUrl: string
  fetch: typeof fetch
  now: () => number
  makeId: () => string
}

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

function openTable(credential: string, config: GmailConfig, options: GmailClientOptions): ConduitTable {
  async function requireSendable(): Promise<{ recipients: string[]; subject: string }> {
    if (!config.recipients || config.recipients.length === 0 || !config.subject) {
      throw new ConduitSourceError(SOURCE, 'This conduit has no recipients/subject configured', 502)
    }
    return { recipients: config.recipients, subject: config.subject }
  }

  // Sent with @m5nv/mail's Gmail transport, as the token's account (no
  // From header: Gmail uses the account's primary address).
  async function send(fields: ConduitFields): Promise<ConduitRecord> {
    const { recipients, subject } = await requireSendable()
    const sender = createMailSender({
      transport: gmailTransport(options),
      account: { credential: fixedToken(credential) },
      now: options.now,
      makeId: options.makeId,
    })
    const result = await sender.send({ to: recipients, subject, text: renderBody(fields) })
    if (!result.ok) throw mailFailureError(SOURCE, result)
    return { id: result.messageId, fields }
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

// The Gmail API client, sending as the token's account.
export function createGmailClient(options: GmailClientOptions): ConduitSourceClient {
  return {
    async connect(_sourceKey, credential, connectionFetch = options.fetch) {
      // No session call: the API addresses the user as `me`. sourceKey
      // is unused. A bad token shows up as a 401 on send.
      return {
        async listTables() {
          // Send-only: there are no tables.
          return []
        },
        open(config) {
          return openTable(credential, configFrom(config), { ...options, fetch: connectionFetch })
        },
      }
    },
    // Nothing to close: each call is a separate HTTPS request.
    async disconnect() {},
    capabilities: () => GMAIL_CAPABILITIES,
  }
}
