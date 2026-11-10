import { messageProblem } from './message.ts'
import type { MailSender, SendingAccount, Transport } from './types.ts'

export interface MailSenderOptions {
  transport: Transport
  account: SendingAccount
  // The clock and id source for each message's Date and Message-ID.
  now: () => number
  makeId: () => string
}

// A MailSender: any transport with any account. A message that can't be
// sent as given is `rejected` before anything is fetched; a refused
// token is forgotten, so the next send gets a new one.
export function createMailSender(options: MailSenderOptions): MailSender {
  const { transport, account } = options
  return {
    async send(message) {
      const problem = messageProblem(account.from, message)
      if (problem) return { ok: false, code: 'rejected', cause: problem }
      const date = new Date(options.now())
      const token = await account.credential.token()
      if (!token.ok) return token
      const result = await transport.send({ token: token.token, from: account.from, message, date, makeId: options.makeId })
      if (!result.ok && result.code === 'auth_failed') account.credential.forget()
      return result
    },
  }
}
