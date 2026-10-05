import {
  type ConduitSourceCapabilities,
  type ConduitSourceClient,
  type ConduitTable,
  type ConduitFieldType,
  type ConduitRecord,
  type ConduitFields,
  ConduitAuthError,
  ConduitSourceError,
} from './sheets.ts'
import { createMailSender, fixedToken, jmapTransport, type JmapAccount, type JmapTransport } from '@m5nv/mail'
import { renderEmailBody as renderBody } from './email-render.ts'
import { mailFailureError } from './mail-outcome.ts'

export const FASTMAIL_CAPABILITIES: ConduitSourceCapabilities = { methods: ['GET', 'POST', 'DELETE'], bulkCreate: false }

// Fastmail over JMAP (RFC 8620/8621): the mailbox mapping in
// INTEGRATIONS.md, with the deviations noted below (no update; delete
// archives).
const SOURCE = 'fastmail'

// Where and how the client reaches Fastmail's JMAP API, and the clock
// and id source for each message's Date and Message-ID.
export interface FastmailClientOptions {
  // For example https://api.fastmail.com/jmap/session.
  sessionUrl: string
  fetch: typeof fetch
  now: () => number
  makeId: () => string
}

const CORE = 'urn:ietf:params:jmap:core'
const MAIL = 'urn:ietf:params:jmap:mail'

// The message template for POST and the mailbox GET reads, set by the
// owner in suri_config and never taken from a submission, so an
// anonymous POST can't choose where mail goes. `config` is the
// suri_config JSON (see ConduitSource.open() in sheets.ts).
type FastmailConfig = {
  table?: string // which mailbox GET reads — default 'Inbox'
  recipients?: string[]
  subject?: string
}

function configFrom(config: string | undefined): FastmailConfig {
  if (!config) return {}
  try {
    const parsed: unknown = JSON.parse(config)
    return typeof parsed === 'object' && parsed !== null ? (parsed as FastmailConfig) : {}
  } catch {
    return {}
  }
}

type JmapErrorResponse = { type: string; description?: string }

async function jmapCall(
  apiUrl: string,
  credential: string,
  using: string[],
  methodCalls: Array<[string, Record<string, unknown>, string]>,
  fetchImpl: typeof fetch,
): Promise<Map<string, [string, Record<string, unknown>]>> {
  const response = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ using, methodCalls }),
  })
  if (response.status === 401) throw new ConduitAuthError(SOURCE, 'Fastmail request failed: token rejected (401)')
  if (!response.ok) throw new ConduitSourceError(SOURCE, `Fastmail request failed (${response.status})`, response.status)

  const body = (await response.json()) as { methodResponses: Array<[string, Record<string, unknown>, string]> }
  const byTag = new Map<string, [string, Record<string, unknown>]>()
  for (const [name, result, tag] of body.methodResponses) {
    if (name === 'error') {
      const error = result as JmapErrorResponse
      throw new ConduitSourceError(SOURCE, `JMAP error: ${error.type}${error.description ? ` (${error.description})` : ''}`, 502)
    }
    // The first response for a tag is the method's own; a method can add
    // implicit ones with the same tag after it (RFC 8621, §7.5).
    if (!byTag.has(tag)) byTag.set(tag, [name, result])
  }
  return byTag
}

// A connection: the account the transport looked up, and the identity
// it sends as (null when the conduit has none).
type FastmailSession = JmapAccount & { identityId: string | null }

export type FastmailIdentity = { id: string; email: string; name: string | null }

// The account's identities from JMAP, for a "Send as" picker and to
// check a submitted identityId belongs to the account: an account can
// have several, and which one a conduit sends as is the owner's choice,
// not guessed.
export async function listFastmailIdentities(options: Pick<FastmailClientOptions, 'sessionUrl' | 'fetch' | 'now'>, credential: string): Promise<FastmailIdentity[]> {
  const account = await jmapTransport(options).account(credential)
  if ('ok' in account) throw mailFailureError(SOURCE, account)
  return account.identities.map((identity) => ({ id: identity.id, email: identity.email, name: identity.name || null }))
}

// A mailbox by role or name, from the connection's lookup.
function findMailboxId(session: FastmailSession, name: string): string {
  const wanted = name.toLowerCase()
  const found = session.mailboxes.find((m) => m.role?.toLowerCase() === wanted || m.name.toLowerCase() === wanted)
  if (!found) throw new ConduitSourceError(SOURCE, `Fastmail mailbox '${name}' not found`, 502)
  return found.id
}

function toConduitRecord(email: {
  id: string
  from?: Array<{ email: string; name?: string | null }> | null
  to?: Array<{ email: string; name?: string | null }> | null
  subject?: string | null
  receivedAt?: string | null
  preview?: string | null
}): ConduitRecord {
  const addr = (list: Array<{ email: string; name?: string | null }> | null | undefined) =>
    (list ?? []).map((a) => a.email).join(', ') || null
  return {
    id: email.id,
    fields: {
      from: addr(email.from),
      to: addr(email.to),
      subject: email.subject ?? null,
      body: email.preview ?? null,
      date: email.receivedAt ?? null,
    },
  }
}

const FIXED_FIELDS: Array<{ name: string; type: ConduitFieldType; nullable: boolean }> = [
  { name: 'from', type: 'string', nullable: true },
  { name: 'to', type: 'string', nullable: true },
  { name: 'subject', type: 'string', nullable: true },
  { name: 'body', type: 'string', nullable: true },
  { name: 'date', type: 'date', nullable: true },
]

function openTable(
  session: FastmailSession,
  credential: string,
  config: FastmailConfig,
  fetchImpl: typeof fetch,
  mail: { transport: JmapTransport; now: () => number; makeId: () => string },
): ConduitTable {
  const mailboxName = config.table ?? 'Inbox'

  async function requireSendable(): Promise<{ recipients: string[]; subject: string; identityId: string }> {
    if (!config.recipients || config.recipients.length === 0 || !config.subject) {
      throw new ConduitSourceError(SOURCE, 'This conduit has no recipients/subject configured', 502)
    }
    if (!session.identityId) {
      throw new ConduitSourceError(SOURCE, 'Fastmail account has no sending identity', 502)
    }
    return { recipients: config.recipients, subject: config.subject, identityId: session.identityId }
  }

  // Sent with @m5nv/mail's JMAP transport, as the chosen identity.
  async function send(fields: ConduitFields): Promise<ConduitRecord> {
    const { recipients, subject, identityId } = await requireSendable()
    const identity = session.identities.find((candidate) => candidate.id === identityId)
    if (!identity) throw new ConduitSourceError(SOURCE, `This conduit's sending identity (${identityId}) is no longer on the Fastmail account`, 502)

    const sender = createMailSender({ transport: mail.transport, account: { from: identity.email, credential: fixedToken(credential) }, now: mail.now, makeId: mail.makeId })
    const result = await sender.send({ to: recipients, subject, text: renderBody(fields) })
    if (!result.ok) throw mailFailureError(SOURCE, result)
    return { id: result.messageId, fields }
  }

  return {
    async describeFields() {
      return FIXED_FIELDS
    },

    async listRecords(page) {
      const mailboxId = findMailboxId(session, mailboxName)
      // Without a page, every message: the gateway finds one by id this way.
      const position = page?.cursor ? Number(page.cursor) : 0
      const results = await jmapCall(
        session.apiUrl,
        credential,
        [CORE, MAIL],
        [
          ['Email/query', { accountId: session.accountId, filter: { inMailbox: mailboxId }, position, ...(page?.limit ? { limit: page.limit } : {}) }, '0'],
          [
            'Email/get',
            {
              accountId: session.accountId,
              '#ids': { resultOf: '0', name: 'Email/query', path: '/ids' },
              properties: ['id', 'from', 'to', 'subject', 'receivedAt', 'preview'],
            },
            '1',
          ],
        ],
        fetchImpl,
      )
      const emails = (results.get('1')?.[1] as { list?: Parameters<typeof toConduitRecord>[0][] } | undefined)?.list ?? []
      const nextCursor = page?.limit && emails.length === page.limit ? String(position + page.limit) : null
      return { records: emails.map(toConduitRecord), nextCursor }
    },

    // Fixed schema: nothing for an owner to add.
    async createField() {
      throw new ConduitSourceError(SOURCE, "Fastmail conduits have a fixed schema — there's no field to add", 500)
    },
    async createFields() {
      throw new ConduitSourceError(SOURCE, "Fastmail conduits have a fixed schema — there's no field to add", 500)
    },
    async deleteField() {
      throw new ConduitSourceError(SOURCE, "Fastmail conduits have a fixed schema — there's no field to remove", 500)
    },
    async deleteFields() {
      throw new ConduitSourceError(SOURCE, "Fastmail conduits have a fixed schema — there's no field to remove", 500)
    },

    async createRecord(fields) {
      return send(fields)
    },
    async createRecords(fieldsList) {
      // JMAP can't send several messages atomically: each record is its
      // own Email/set and EmailSubmission/set, so a failure partway
      // leaves earlier messages sent. capabilities().bulkCreate is
      // false, so the gateway passes one record at a time.
      const records: ConduitRecord[] = []
      for (const fields of fieldsList) records.push(await send(fields))
      return records
    },

    // capabilities().methods doesn't offer PUT or PATCH; this throws in
    // case it is called anyway. See INTEGRATIONS.md.
    async replaceRecord() {
      throw new ConduitSourceError(SOURCE, 'Fastmail conduits do not support replace', 500)
    },
    async replaceRecords() {
      throw new ConduitSourceError(SOURCE, 'Fastmail conduits do not support replace', 500)
    },
    async updateRecord() {
      throw new ConduitSourceError(SOURCE, 'Fastmail conduits do not support update', 500)
    },
    async updateRecords() {
      throw new ConduitSourceError(SOURCE, 'Fastmail conduits do not support update', 500)
    },

    // Delete moves the message to Trash; a message's folder is the only
    // thing about it that can change.
    async deleteRecord(id) {
      const trashId = findMailboxId(session, 'trash')
      const results = await jmapCall(
        session.apiUrl,
        credential,
        [CORE, MAIL],
        [['Email/set', { accountId: session.accountId, update: { [id]: { mailboxIds: { [trashId]: true } } } }, '0']],
        fetchImpl,
      )
      const updated = (results.get('0')?.[1] as { updated?: Record<string, unknown> } | undefined)?.updated
      return Boolean(updated && id in updated)
    },
    async deleteRecords(ids) {
      const trashId = findMailboxId(session, 'trash')
      const update: Record<string, { mailboxIds: Record<string, boolean> }> = {}
      for (const id of ids) update[id] = { mailboxIds: { [trashId]: true } }
      const results = await jmapCall(
        session.apiUrl,
        credential,
        [CORE, MAIL],
        [['Email/set', { accountId: session.accountId, update }, '0']],
        fetchImpl,
      )
      const updated = (results.get('0')?.[1] as { updated?: Record<string, unknown>; notUpdated?: Record<string, unknown> } | undefined)
      if (!updated || updated.notUpdated) return false // atomic: any failure fails the whole batch
      return ids.every((id) => id in (updated.updated ?? {}))
    },
  }
}

// The Fastmail JMAP client. A connection's sourceKey is the identity it
// sends as.
export function createFastmailClient(options: FastmailClientOptions): ConduitSourceClient {
  return {
    async connect(sourceKey, credential, fetchImpl = options.fetch) {
      // sourceKey is the identity to send as; the credential alone
      // identifies the JMAP account. One lookup (the session, then the
      // identities and mailboxes) serves every call on the connection,
      // sends included, and refuses a bad credential here.
      const transport = jmapTransport({ sessionUrl: options.sessionUrl, fetch: fetchImpl, now: options.now })
      const account = await transport.account(credential)
      if ('ok' in account) throw mailFailureError(SOURCE, account)
      const session: FastmailSession = { ...account, identityId: sourceKey || null }
      return {
        async listTables() {
          return session.mailboxes.map((m) => m.name)
        },
        open(config) {
          return openTable(session, credential, configFrom(config), fetchImpl, { transport, now: options.now, makeId: options.makeId })
        },
      }
    },
    // Nothing to close: each call is a separate HTTPS request.
    async disconnect() {},
    capabilities: () => FASTMAIL_CAPABILITIES,
  }
}
