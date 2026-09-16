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

// Fastmail, over JMAP (RFC 8620/8621) — the real, shipped instance of
// the mailbox-shaped-source mapping INTEGRATIONS.md describes
// generally, with every deviation from that general mapping summarized
// below (RACM never exposes update, delete means archive, etc).
const SOURCE = 'fastmail'

const SESSION_URL = 'https://api.fastmail.com/jmap/session'
const CORE = 'urn:ietf:params:jmap:core'
const MAIL = 'urn:ietf:params:jmap:mail'
const SUBMISSION = 'urn:ietf:params:jmap:submission'

// The whole message template for `POST`, plus which mailbox `GET`
// reads from — owner-configured in suri_config, never taken from a
// submission's own fields (a public, anonymous POST must never
// control its own destination). See ConduitSource.open()'s own doc in
// sheets.ts: `config` is the conduit's whole suri_config, JSON-encoded.
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
): Promise<Map<string, [string, Record<string, unknown>]>> {
  const response = await fetch(apiUrl, {
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

// A JMAP account can have more than one sending identity (aliases, or
// additional addresses on a custom domain) — which one a conduit sends
// as is a real, owner-facing choice (a "Send as" picker, wherever a
// caller builds one), not something to silently guess. Resolved once at
// connect time via `listFastmailIdentities` below; the account/session
// lookup here is otherwise identical to that function's own, factored
// out to avoid the two diverging.
async function fetchMailAccount(credential: string): Promise<{ apiUrl: string; accountId: string }> {
  const response = await fetch(SESSION_URL, { headers: { Authorization: `Bearer ${credential}` } })
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

// sourceKey here is the identity id chosen at connect time (see
// ConduitSourceClient.connect()'s own sourceKey doc: it's this
// conduit's own suri_object_key, the same slot a spreadsheet id fills
// for Sheets) — never re-derived here. A conduit connected before an
// identity was ever chosen (or one somehow missing its own) has no
// fallback: requireSendable() below fails clearly rather than silently
// picking whichever identity JMAP happens to list first.
async function fetchSession(credential: string, identityId: string | null): Promise<FastmailSession> {
  const { apiUrl, accountId } = await fetchMailAccount(credential)
  return { apiUrl, accountId, identityId }
}

export type FastmailIdentity = { id: string; email: string; name: string | null }

// Real, live JMAP lookup — used to build a "Send as" picker, and to
// verify a submitted identityId is actually one of this account's own
// rather than trusting the client. NODE_ENV=test swaps in
// listMailpitIdentities below — Mailpit has no JMAP/Identity concept at
// all, so there's nothing real to fake here, only a fixed stand-in (see
// that function's own comment). Exported directly (not just through
// listFastmailIdentities) for its own unit test, same reasoning
// createJmapFastmailClient() is — the swapped-in export is otherwise
// unreachable under NODE_ENV=test.
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

// Test-only stand-in — a single fixed identity, so a "Send as" picker
// stays invisible in tests (one identity = no picker
// shown, same as a real single-identity account) rather than every
// existing test needing to interact with a picker UI that has no real
// Mailpit equivalent to test against in the first place.
async function listMailpitIdentities(): Promise<FastmailIdentity[]> {
  return [{ id: 'mailpit-test-identity', email: 'sender@mailpit.test', name: null }]
}

export const listFastmailIdentities: (credential: string) => Promise<FastmailIdentity[]> =
  process.env.NODE_ENV === 'test' ? listMailpitIdentities : listJmapIdentities

async function findMailboxId(apiUrl: string, credential: string, accountId: string, name: string): Promise<string> {
  const results = await jmapCall(apiUrl, credential, [CORE, MAIL], [['Mailbox/get', { accountId, ids: null }, '0']])
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

function openTable(session: FastmailSession, credential: string, config: FastmailConfig): ConduitTable {
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
    const draftsId = await findMailboxId(session.apiUrl, credential, session.accountId, 'drafts')
    const results = await jmapCall(session.apiUrl, credential, [CORE, MAIL, SUBMISSION], [
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
    ])

    const created = (results.get('0')?.[1] as { created?: Record<string, { id: string }> } | undefined)?.created
    const draftId = created?.draft?.id
    if (!draftId) throw new ConduitSourceError(SOURCE, 'Fastmail did not create the draft message', 502)

    const submitted = (results.get('1')?.[1] as { created?: Record<string, unknown> } | undefined)?.created
    if (!submitted?.sendIt) {
      // Created but never submitted — a real partial-failure case (see
      // the investigation doc). The draft is left behind rather than
      // silently retried; onSuccessDestroyEmail above never ran, so
      // it's still sitting in Drafts, visibly not a sent message.
      throw new ConduitSourceError(SOURCE, 'Fastmail accepted the draft but did not submit it for sending', 502)
    }

    return { id: draftId, fields }
  }

  return {
    async describeFields() {
      return FIXED_FIELDS
    },

    async listRecords(page) {
      const mailboxId = await findMailboxId(session.apiUrl, credential, session.accountId, mailboxName)
      const limit = page?.limit ?? 50
      const position = page?.cursor ? Number(page.cursor) : 0
      const results = await jmapCall(session.apiUrl, credential, [CORE, MAIL], [
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
      ])
      const emails = (results.get('1')?.[1] as { list?: Parameters<typeof toConduitRecord>[0][] } | undefined)?.list ?? []
      const nextCursor = emails.length === limit ? String(position + limit) : null
      return { records: emails.map(toConduitRecord), nextCursor }
    },

    // Fixed schema — nothing for an owner to add. Same deviation shape
    // replaceRecord/replaceRecords use below.
    async createField() {
      throw new ConduitSourceError(SOURCE, "Fastmail conduits have a fixed schema — there's no field to add", 500)
    },
    async createFields() {
      throw new ConduitSourceError(SOURCE, "Fastmail conduits have a fixed schema — there's no field to add", 500)
    },

    async createRecord(fields) {
      return send(fields)
    },
    async createRecords(fieldsList) {
      // No atomic multi-message send in JMAP the way Sheets bulk-writes
      // one grid call — each send is its own independent Email/set +
      // EmailSubmission/set pair (see data-source-interface.md's
      // original finding: bulk atomicity doesn't transfer for email). A
      // failure partway through this loop leaves earlier messages
      // already, really sent with no way to report that back — exactly
      // why capabilities().bulkCreate is false below, so the gateway
      // never actually calls this with more than one entry; this loop
      // still exists for direct/future callers of the interface itself.
      const records: ConduitRecord[] = []
      for (const fields of fieldsList) records.push(await send(fields))
      return records
    },

    // Never reachable via RACM (capabilities().methods below never
    // offers PUT/PATCH) — throwing rather than implementing flags/labels
    // logic nothing can call. See INTEGRATIONS.md's mailbox-mapping
    // section.
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

    // "Delete" is archive, not permanent destruction — move to Trash,
    // matching what's actually mutable for a message (folder
    // membership), same reasoning the investigation doc gives.
    async deleteRecord(id) {
      const trashId = await findMailboxId(session.apiUrl, credential, session.accountId, 'trash')
      const results = await jmapCall(session.apiUrl, credential, [CORE, MAIL], [
        ['Email/set', { accountId: session.accountId, update: { [id]: { mailboxIds: { [trashId]: true } } } }, '0'],
      ])
      const updated = (results.get('0')?.[1] as { updated?: Record<string, unknown> } | undefined)?.updated
      return Boolean(updated && id in updated)
    },
    async deleteRecords(ids) {
      const trashId = await findMailboxId(session.apiUrl, credential, session.accountId, 'trash')
      const update: Record<string, { mailboxIds: Record<string, boolean> }> = {}
      for (const id of ids) update[id] = { mailboxIds: { [trashId]: true } }
      const results = await jmapCall(session.apiUrl, credential, [CORE, MAIL], [
        ['Email/set', { accountId: session.accountId, update }, '0'],
      ])
      const updated = (results.get('0')?.[1] as { updated?: Record<string, unknown>; notUpdated?: Record<string, unknown> } | undefined)
      if (!updated || updated.notUpdated) return false // atomic: any failure fails the whole batch
      return ids.every((id) => id in (updated.updated ?? {}))
    },
  }
}

// Exported for its own unit test (mocked fetch, real request/response
// shapes) — NODE_ENV=test always resolves fastmailClient itself to
// the Mailpit-backed client below, so this is otherwise unreachable
// in the test environment.
export function createJmapFastmailClient(): ConduitSourceClient {
  return {
    async connect(sourceKey, credential) {
      // sourceKey is the identity id chosen at connect time (see
      // fetchSession's own comment) — the JMAP account itself is still
      // fully identified by the credential alone, but *which identity
      // to send as* is a real per-conduit choice, the same role a
      // spreadsheet id plays for Sheets.
      const session = await fetchSession(credential, sourceKey || null)
      return {
        async listTables() {
          const results = await jmapCall(session.apiUrl, credential, [CORE, MAIL], [
            ['Mailbox/get', { accountId: session.accountId, ids: null }, '0'],
          ])
          const mailboxes = (results.get('0')?.[1] as { list?: Array<{ name: string }> } | undefined)?.list ?? []
          return mailboxes.map((m) => m.name)
        },
        open(config) {
          return openTable(session, credential, configFrom(config))
        },
      }
    },
    // Nothing to tear down — plain per-request HTTPS calls, no pooled
    // connection, same as Sheets' own no-op disconnect().
    async disconnect() {},
    capabilities: () => ({ methods: ['GET', 'POST', 'DELETE'], bulkCreate: false }),
  }
}

// Test-only: a real Fastmail account/JMAP session doesn't exist in
// tests, so NODE_ENV=test swaps this in — same shape sheets.ts uses
// for its own fake client, but this one exercises a real protocol
// (real SMTP, real REST reads) against Mailpit, a local mail-testing
// server, rather than an in-memory simulation: faking is fine for
// Sheets (a simple grid model), not for email (delivery is the actual
// behavior under test). Mailpit itself has no JMAP endpoint (SMTP + a
// REST API only), so this is a genuinely different implementation from
// createJmapFastmailClient() above, not the same code pointed at a
// different host — same relationship sheets.ts's own fake/real split
// already has. The SMTP/REST plumbing itself lives in
// mailpit-test-client.ts, shared with gmail.ts's own identical-shaped
// test client.
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
            // Mailpit assigns the real id; a synthetic placeholder here
            // is corrected the moment a caller actually lists/reads —
            // same "id known only after the real write" shape a
            // network-addressed source always has.
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
