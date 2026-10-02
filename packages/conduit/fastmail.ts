import {
  type ConduitSourceClient,
  type ConduitTable,
  type ConduitFieldType,
  type ConduitRecord,
  type ConduitFields,
  ConduitAuthError,
  ConduitSourceError,
} from './sheets.ts'
import { sendViaSmtp, mailpitFetch, summaryToRecord, type MailpitMessageSummary } from './mailpit-test-client.ts'
import { renderEmailBody as renderBody } from './email-render.ts'

// Fastmail over JMAP (RFC 8620/8621): the mailbox mapping in
// INTEGRATIONS.md, with the deviations noted below (no update; delete
// archives).
const SOURCE = 'fastmail'

const SESSION_URL = 'https://api.fastmail.com/jmap/session'
const CORE = 'urn:ietf:params:jmap:core'
const MAIL = 'urn:ietf:params:jmap:mail'
const SUBMISSION = 'urn:ietf:params:jmap:submission'

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
  fetchImpl: typeof fetch = fetch,
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
    byTag.set(tag, [name, result])
  }
  return byTag
}

type FastmailSession = { apiUrl: string; accountId: string; identityId: string | null }

// An account can have several sending identities, and which one a
// conduit sends as is the owner's choice, not guessed. Shared with
// listFastmailIdentities so the session lookup is written once.
async function fetchMailAccount(
  credential: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ apiUrl: string; accountId: string }> {
  const response = await fetchImpl(SESSION_URL, { headers: { Authorization: `Bearer ${credential}` } })
  if (response.status === 401) throw new ConduitAuthError(SOURCE, 'Fastmail session fetch failed: token rejected (401)')
  if (!response.ok) throw new ConduitSourceError(SOURCE, `Fastmail session fetch failed (${response.status})`, response.status)

  const session = (await response.json()) as {
    apiUrl: string
    primaryAccounts?: Record<string, string>
  }
  const accountId = session.primaryAccounts?.[MAIL]
  if (!accountId) throw new ConduitSourceError(SOURCE, 'Fastmail session has no mail account', 502)
  return { apiUrl: session.apiUrl, accountId }
}

// sourceKey is the identity id chosen when connecting (the conduit's
// suri_object_key). Without one, requireSendable() fails rather than
// sending as JMAP's first identity.
async function fetchSession(
  credential: string,
  identityId: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<FastmailSession> {
  const { apiUrl, accountId } = await fetchMailAccount(credential, fetchImpl)
  return { apiUrl, accountId, identityId }
}

export type FastmailIdentity = { id: string; email: string; name: string | null }

// The account's identities from JMAP, for a "Send as" picker and to
// check a submitted identityId belongs to the account. Under
// NODE_ENV=test, listFastmailIdentities uses listMailpitIdentities
// instead; this is exported for its unit test.
export async function listJmapIdentities(credential: string): Promise<FastmailIdentity[]> {
  const { apiUrl, accountId } = await fetchMailAccount(credential)
  const results = await jmapCall(apiUrl, credential, [CORE, SUBMISSION], [['Identity/get', { accountId, ids: null }, '0']])
  const identities = results.get('0')?.[1] as
    | { list?: Array<{ id: string; email: string; name?: string | null }> }
    | undefined
  return (identities?.list ?? []).map((identity) => ({
    id: identity.id,
    email: identity.email,
    name: identity.name || null,
  }))
}

// For tests: one fixed identity, so no "Send as" picker appears.
async function listMailpitIdentities(): Promise<FastmailIdentity[]> {
  return [{ id: 'mailpit-test-identity', email: 'sender@mailpit.test', name: null }]
}

export const listFastmailIdentities: (credential: string) => Promise<FastmailIdentity[]> =
  process.env.NODE_ENV === 'test' ? listMailpitIdentities : listJmapIdentities

async function findMailboxId(
  apiUrl: string,
  credential: string,
  accountId: string,
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const results = await jmapCall(apiUrl, credential, [CORE, MAIL], [['Mailbox/get', { accountId, ids: null }, '0']], fetchImpl)
  const mailboxes = (results.get('0')?.[1] as { list?: Array<{ id: string; name: string; role: string | null }> } | undefined)
    ?.list ?? []
  const wanted = name.toLowerCase()
  const found = mailboxes.find((m) => m.role?.toLowerCase() === wanted || m.name.toLowerCase() === wanted)
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
  fetchImpl: typeof fetch = fetch,
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

  async function send(fields: ConduitFields): Promise<ConduitRecord> {
    const { recipients, subject, identityId } = await requireSendable()
    const draftsId = await findMailboxId(session.apiUrl, credential, session.accountId, 'drafts', fetchImpl)
    const results = await jmapCall(
      session.apiUrl,
      credential,
      [CORE, MAIL, SUBMISSION],
      [
        [
          'Email/set',
          {
            accountId: session.accountId,
            create: {
              draft: {
                mailboxIds: { [draftsId]: true },
                keywords: { $draft: true },
                from: [{ email: recipients[0] }], // overwritten by the account's own identity server-side
                to: recipients.map((email) => ({ email })),
                subject,
                textBody: [{ partId: 'body', type: 'text/plain' }],
                bodyValues: { body: { value: renderBody(fields), charset: 'utf-8' } },
              },
            },
          },
          '0',
        ],
        [
          'EmailSubmission/set',
          {
            accountId: session.accountId,
            onSuccessDestroyEmail: ['#sendIt'],
            create: { sendIt: { emailId: '#draft', identityId } },
          },
          '1',
        ],
      ],
      fetchImpl,
    )

    const created = (results.get('0')?.[1] as { created?: Record<string, { id: string }> } | undefined)?.created
    const draftId = created?.draft?.id
    if (!draftId) throw new ConduitSourceError(SOURCE, 'Fastmail did not create the draft message', 502)

    const submitted = (results.get('1')?.[1] as { created?: Record<string, unknown> } | undefined)?.created
    if (!submitted?.sendIt) {
      // Created but not submitted: the draft stays in Drafts rather than
      // being retried (onSuccessDestroyEmail didn't run).
      throw new ConduitSourceError(SOURCE, 'Fastmail accepted the draft but did not submit it for sending', 502)
    }

    return { id: draftId, fields }
  }

  return {
    async describeFields() {
      return FIXED_FIELDS
    },

    async listRecords(page) {
      const mailboxId = await findMailboxId(session.apiUrl, credential, session.accountId, mailboxName, fetchImpl)
      const limit = page?.limit ?? 50
      const position = page?.cursor ? Number(page.cursor) : 0
      const results = await jmapCall(
        session.apiUrl,
        credential,
        [CORE, MAIL],
        [
          ['Email/query', { accountId: session.accountId, filter: { inMailbox: mailboxId }, position, limit }, '0'],
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
      const nextCursor = emails.length === limit ? String(position + limit) : null
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
      const trashId = await findMailboxId(session.apiUrl, credential, session.accountId, 'trash', fetchImpl)
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
      const trashId = await findMailboxId(session.apiUrl, credential, session.accountId, 'trash', fetchImpl)
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

// Exported for its unit test; under NODE_ENV=test fastmailClient is the
// Mailpit-backed client below.
export function createJmapFastmailClient(): ConduitSourceClient {
  return {
    async connect(sourceKey, credential, fetchImpl = fetch) {
      // sourceKey is the identity to send as; the credential alone
      // identifies the JMAP account.
      const session = await fetchSession(credential, sourceKey || null, fetchImpl)
      return {
        async listTables() {
          const results = await jmapCall(
            session.apiUrl,
            credential,
            [CORE, MAIL],
            [['Mailbox/get', { accountId: session.accountId, ids: null }, '0']],
            fetchImpl,
          )
          const mailboxes = (results.get('0')?.[1] as { list?: Array<{ name: string }> } | undefined)?.list ?? []
          return mailboxes.map((m) => m.name)
        },
        open(config) {
          return openTable(session, credential, configFrom(config), fetchImpl)
        },
      }
    },
    // Nothing to close: each call is a separate HTTPS request.
    async disconnect() {},
    capabilities: () => ({ methods: ['GET', 'POST', 'DELETE'], bulkCreate: false }),
  }
}

// For tests: sends real mail through Mailpit (SMTP, plus its REST API
// for reads) instead of JMAP, which Mailpit lacks, because delivery is
// what's being tested. The SMTP and REST code is in
// mailpit-test-client.ts, shared with gmail.ts.
function fastmailMailpitFetch(path: string, init?: RequestInit): Promise<Response> {
  return mailpitFetch(SOURCE, path, init)
}

function createMailpitFastmailClient(): ConduitSourceClient {
  return {
    async connect() {
      return {
        async listTables() {
          return ['INBOX']
        },
        open(config) {
          const parsed = configFrom(config)

          async function send(fields: ConduitFields): Promise<ConduitRecord> {
            if (!parsed.recipients || parsed.recipients.length === 0 || !parsed.subject) {
              throw new ConduitSourceError(SOURCE, 'This conduit has no recipients/subject configured', 502)
            }
            await sendViaSmtp(parsed.recipients[0]!, parsed.recipients, parsed.subject, renderBody(fields))
            // Mailpit assigns the id; this placeholder is replaced when
            // the message is read back.
            return { id: '', fields }
          }

          return {
            async describeFields() {
              return FIXED_FIELDS
            },
            async listRecords(page) {
              const limit = page?.limit ?? 50
              const start = page?.cursor ? Number(page.cursor) : 0
              const body = (await (
                await fastmailMailpitFetch(`/api/v1/messages?limit=${limit}&start=${start}`)
              ).json()) as { messages: MailpitMessageSummary[]; total: number }
              const nextCursor = start + body.messages.length < body.total ? String(start + body.messages.length) : null
              return { records: body.messages.map(summaryToRecord), nextCursor }
            },
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
              const records: ConduitRecord[] = []
              for (const fields of fieldsList) {
                records.push(await send(fields))
              }
              return records
            },
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
            async deleteRecord(id) {
              await fastmailMailpitFetch('/api/v1/messages', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ IDs: [id] }),
              })
              return true
            },
            async deleteRecords(ids) {
              await fastmailMailpitFetch('/api/v1/messages', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ IDs: ids }),
              })
              return true
            },
          }
        },
      }
    },
    async disconnect() {},
    capabilities: () => ({ methods: ['GET', 'POST', 'DELETE'], bulkCreate: false }),
  }
}

export const fastmailClient: ConduitSourceClient =
  process.env.NODE_ENV === 'test' ? createMailpitFastmailClient() : createJmapFastmailClient()
