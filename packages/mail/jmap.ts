import { retryAfterSeconds } from './credentials.ts'
import { DEFAULT_RETRY_AFTER_SECONDS, type SendFailure, type SendResult, type Transport } from './types.ts'

export interface JmapIdentity {
  id: string
  email: string
  name: string
}

export interface JmapMailbox {
  id: string
  name: string
  role: string | null
}

// The mail account a token opens, as the transport looked it up.
export interface JmapAccount {
  apiUrl: string
  accountId: string
  identities: JmapIdentity[]
  mailboxes: JmapMailbox[]
}

export interface JmapTransport extends Transport {
  // The account, from the same lookup a send uses: a caller that also
  // reads the account needs no session of its own.
  account(token: string): Promise<JmapAccount | SendFailure>
}

export interface JmapTransportOptions {
  // https://api.fastmail.com/jmap/session for Fastmail.
  sessionUrl: string
  fetch: typeof fetch
  now: () => number
}

const CORE = 'urn:ietf:params:jmap:core'
const MAIL = 'urn:ietf:params:jmap:mail'
const SUBMISSION = 'urn:ietf:params:jmap:submission'

type MethodResponse = [string, Record<string, unknown>, string]

interface Account extends JmapAccount {
  token: string
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

// JMAP (RFC 8620, 8621): the message is created in Drafts and submitted
// in one request, as the identity whose address is `from`; the draft is
// destroyed once submitted. The account, its identities and its
// mailboxes are looked up once per token.
export function jmapTransport(options: JmapTransportOptions): JmapTransport {
  let account: Account | null = null

  // Failures here happen before anything is submitted, so a retry is safe.
  async function lookUp(token: string): Promise<Account | SendFailure> {
    if (account?.token === token) return account
    const now = options.now()
    try {
      const sessionResponse = await options.fetch(options.sessionUrl, { headers: { authorization: `Bearer ${token}` } })
      const refused = refusal(sessionResponse, 'session', now)
      if (refused) return refused
      const session = (await sessionResponse.json()) as { apiUrl: string; primaryAccounts?: Record<string, string> }
      const accountId = session.primaryAccounts?.[MAIL]
      if (!accountId) return { ok: false, code: 'rejected', cause: 'JMAP session has no mail account' }

      const response = await call(session.apiUrl, token, [CORE, MAIL, SUBMISSION], [
        ['Identity/get', { accountId, ids: null }, 'identities'],
        ['Mailbox/get', { accountId, ids: null, properties: ['name', 'role'] }, 'mailboxes'],
      ])
      const refusedCall = refusal(response, 'lookup', now)
      if (refusedCall) return refusedCall
      const results = byTag(((await response.json()) as { methodResponses: MethodResponse[] }).methodResponses)
      for (const tag of ['identities', 'mailboxes']) {
        const result = results.get(tag)
        if (!result || result[0] === 'error') return setFailure(tag === 'identities' ? 'Identity/get' : 'Mailbox/get', result ?? ['error', { type: 'missing' }, tag], undefined)
      }
      const identities = (results.get('identities')![1].list ?? []) as JmapIdentity[]
      const mailboxes = (results.get('mailboxes')![1].list ?? []) as JmapMailbox[]
      account = { token, apiUrl: session.apiUrl, accountId, identities, mailboxes }
      return account
    } catch (error) {
      return { ok: false, code: 'unavailable', retryAfter: DEFAULT_RETRY_AFTER_SECONDS, cause: `JMAP: ${errorMessage(error)}` }
    }
  }

  function call(apiUrl: string, token: string, using: string[], methodCalls: MethodResponse[]): Promise<Response> {
    return options.fetch(apiUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ using, methodCalls }),
    })
  }

  // A response that refused the request without acting on it.
  function refusal(response: Response, what: string, now: number): SendFailure | null {
    if (response.ok) return null
    const cause = `JMAP ${what} ${response.status}`
    if (response.status === 401 || response.status === 403) {
      account = null
      return { ok: false, code: 'auth_failed', cause }
    }
    if (response.status === 429 || response.status === 503) return { ok: false, code: 'unavailable', retryAfter: retryAfterSeconds(response.headers.get('retry-after'), now), cause }
    if (response.status < 500) return { ok: false, code: 'rejected', cause }
    return { ok: false, code: 'unavailable', retryAfter: DEFAULT_RETRY_AFTER_SECONDS, cause }
  }

  return {
    async account(token) {
      const found = await lookUp(token)
      if ('ok' in found) return found
      const { token: _token, ...account } = found
      return account
    },

    async send({ token, from, message, date, makeId }): Promise<SendResult> {
      if (!from) throw new Error('jmapTransport needs a from address: it sends as the identity with that address')
      const found = await lookUp(token)
      if ('ok' in found) return found
      const identity = found.identities.find((candidate) => candidate.email.toLowerCase() === from.toLowerCase())
      if (!identity) return { ok: false, code: 'rejected', cause: `the account has no identity for ${from}` }
      const draftsId = found.mailboxes.find((mailbox) => mailbox.role === 'drafts')?.id
      if (!draftsId) return { ok: false, code: 'rejected', cause: 'the account has no Drafts mailbox' }

      const bodies = {
        textBody: [{ partId: 'text', type: 'text/plain' }],
        ...(message.html === undefined ? {} : { htmlBody: [{ partId: 'html', type: 'text/html' }] }),
        bodyValues: { text: { value: message.text }, ...(message.html === undefined ? {} : { html: { value: message.html } }) },
      }
      const email = {
        mailboxIds: { [draftsId]: true },
        keywords: { $draft: true },
        from: [{ email: identity.email, ...(identity.name ? { name: identity.name } : {}) }],
        to: message.to.map((email) => ({ email })),
        ...(message.replyTo ? { replyTo: [{ email: message.replyTo }] } : {}),
        subject: message.subject,
        messageId: [`${makeId()}@${from.split('@')[1]}`],
        sentAt: date.toISOString(),
        ...bodies,
      }

      const now = options.now()
      let response: Response
      try {
        response = await call(found.apiUrl, token, [CORE, MAIL, SUBMISSION], [
          ['Email/set', { accountId: found.accountId, create: { draft: email } }, 'draft'],
          ['EmailSubmission/set', { accountId: found.accountId, onSuccessDestroyEmail: ['#send'], create: { send: { emailId: '#draft', identityId: identity.id } } }, 'send'],
        ])
      } catch (error) {
        return { ok: false, code: 'outcome_unknown', cause: `JMAP: ${errorMessage(error)}` }
      }
      if (response.status >= 500 && response.status !== 503) return { ok: false, code: 'outcome_unknown', cause: `JMAP send ${response.status}` }
      const refused = refusal(response, 'send', now)
      if (refused) return refused

      let results: Map<string, MethodResponse>
      try {
        results = byTag(((await response.json()) as { methodResponses: MethodResponse[] }).methodResponses)
      } catch (error) {
        return { ok: false, code: 'outcome_unknown', cause: `JMAP send: unreadable answer (${errorMessage(error)})` }
      }

      const draft = results.get('draft')
      const draftId = (draft?.[1].created as Record<string, { id: string }> | undefined)?.draft?.id
      if (!draft) return { ok: false, code: 'outcome_unknown', cause: 'JMAP answered without the Email/set result' }
      if (!draftId) return setFailure('Email/set', draft, (draft[1].notCreated as Record<string, SetError> | undefined)?.draft)

      const submission = results.get('send')
      if (!submission) return { ok: false, code: 'outcome_unknown', cause: 'JMAP answered without the EmailSubmission/set result' }
      if (!(submission[1].created as Record<string, unknown> | undefined)?.send) {
        // Not submitted: remove the draft, so failures don't pile up in
        // Drafts. Best effort; the outcome is the submission's.
        await call(found.apiUrl, token, [CORE, MAIL], [['Email/set', { accountId: found.accountId, destroy: [draftId] }, 'cleanup']]).catch(() => {})
        return setFailure('EmailSubmission/set', submission, (submission[1].notCreated as Record<string, SetError> | undefined)?.send)
      }
      return { ok: true, messageId: draftId }
    },
  }
}

type SetError = { type: string; description?: string }

// The first response for each tag is the method's own. A method can add
// an implicit one with the same tag after it: EmailSubmission/set's
// onSuccessDestroyEmail adds an Email/set (RFC 8621, §7.5).
function byTag(responses: MethodResponse[]): Map<string, MethodResponse> {
  const results = new Map<string, MethodResponse>()
  for (const response of responses) if (!results.has(response[2])) results.set(response[2], response)
  return results
}

// A method that did not create its object: nothing was sent.
function setFailure(method: string, response: MethodResponse, setError: SetError | undefined): SendFailure {
  const type = response[0] === 'error' ? String(response[1].type) : (setError?.type ?? 'unknown')
  const cause = `${method}: ${type}${setError?.description ? ` (${setError.description})` : ''}`
  if (type === 'serverFail' || type === 'serverUnavailable') return { ok: false, code: 'unavailable', retryAfter: DEFAULT_RETRY_AFTER_SECONDS, cause }
  // RFC 8621 §7.5: forbiddenToSend covers a sending limit.
  if (type === 'forbiddenToSend') return { ok: false, code: 'rate_limited', retryAfter: DEFAULT_RETRY_AFTER_SECONDS, cause }
  return { ok: false, code: 'rejected', cause }
}
