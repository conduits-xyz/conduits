# @m5nv/mail

Sends email through a mail provider's API: JMAP (Fastmail) or the Gmail
API. A sender is a **transport** (how the message reaches the provider)
and an **account** (the From address, and a credential that gives the
bearer token the provider accepts). Any credential works with either
transport. The package has no dependencies beyond Node.

```ts
import { randomUUID } from 'node:crypto'
import { createMailSender, fixedToken, jmapTransport } from '@m5nv/mail'

const mail = createMailSender({
  transport: jmapTransport({ sessionUrl: 'https://api.fastmail.com/jmap/session', fetch, now: Date.now }),
  account: { from: 'noreply@example.com', credential: fixedToken(process.env.FASTMAIL_TOKEN!) },
  now: Date.now,
  makeId: randomUUID,
})

const result = await mail.send({ to: ['ada@example.com'], subject: 'Welcome', text: '…', html: '<p>…</p>' })
```

A Google Workspace account sends through Gmail as a service account
with domain-wide delegation:

```ts
const mail = createMailSender({
  transport: gmailTransport({ apiUrl: 'https://gmail.googleapis.com/gmail/v1', fetch, now: Date.now }),
  account: {
    from: 'noreply@example.com',
    credential: googleServiceAccount({
      tokenUrl: 'https://oauth2.googleapis.com/token',
      fetch,
      now: Date.now,
      key: { clientEmail: key.client_email, privateKey: key.private_key }, // the account's JSON key
      subject: 'noreply@example.com',
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
    }),
  },
  now: Date.now,
  makeId: randomUUID,
})
```

A Workspace admin must authorize the service account's client ID for
`gmail.send` (Admin console › Security › API controls › Domain-wide
delegation). Gmail sends as `subject`. Workspace allows about 2,000
messages a day per user.

| File | Contents |
|:--|:--|
| `types.ts` | `MailMessage`, `SendResult`, `MailSender`, `SendingAccount`, `Credential`, `Transport`. |
| `sender.ts` | `createMailSender`. |
| `credentials.ts` | `fixedToken`, `googleServiceAccount`. |
| `jmap.ts` | `jmapTransport`. |
| `gmail.ts` | `gmailTransport`. |
| `message.ts` | RFC 5322 messages: headers, encoded subjects, multipart/alternative. |

## Outcomes

`send` never throws for a provider's answer. It returns
`{ ok: true, messageId }` (the provider's id for the message) or
`{ ok: false, code, cause }`, where `cause` is for logs and `code` is
one of:

| Code | Sent? | Retry |
|:--|:--|:--|
| `auth_failed` | No | No: the credential needs fixing. The token is forgotten, so the next send gets a new one. |
| `rejected` | No | No: the message or sender was refused (an address, no identity for `from`, the provider's own refusal), or the message has no recipients or a line break in a header value. |
| `rate_limited` | No | After `retryAfter` seconds: a sending limit. |
| `unavailable` | No | After `retryAfter` seconds: the provider was unreachable or failed before the message was handed over. |
| `outcome_unknown` | Perhaps | **No.** The message was handed over and the answer was lost or was a server error. Neither provider takes an idempotency key, so a retry can send the message twice. |

Without a `Retry-After` from the provider, `retryAfter` is 30 seconds
(`DEFAULT_RETRY_AFTER_SECONDS`).

`jmapTransport` without a `from` address throws: it is a programming
error, not an outcome.

## How each transport sends

- **JMAP** looks up the account, its identities and its mailboxes once
  per token, then sends each message in one request: `Email/set`
  creates it in Drafts as the identity whose address is `from`, and
  `EmailSubmission/set` submits it and destroys the draft. A submission
  that fails removes the draft. `account(token)` gives that lookup
  (API URL, account id, identities, mailboxes) to a caller that also
  reads the account.
- **Gmail** sends the whole message to `users.messages.send`. Gmail
  sends as the token's account; without `from`, it uses that account's
  primary address.
