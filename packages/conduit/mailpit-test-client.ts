import { ConduitSourceError, type ConduitRecord } from './sheets.ts'

// Shared test-only plumbing for every email-shaped source's own
// NODE_ENV=test client (fastmail.ts, gmail.ts) — a real local SMTP
// server + REST API (Mailpit), not a hand-rolled in-memory fake: faking
// is fine for Sheets (a simple grid model), not for email (delivery is
// the actual behavior under test). Not part of this package's public
// ConduitSourceClient contract — purely internal to how each email
// source's own test client is built, so it's never re-exported from
// index.ts.

const MAILPIT_SMTP_HOST = process.env.MAILPIT_SMTP_HOST ?? 'localhost'
const MAILPIT_SMTP_PORT = Number(process.env.MAILPIT_SMTP_PORT ?? 1025)
const MAILPIT_API_URL = process.env.MAILPIT_API_URL ?? 'http://localhost:8025'

export type MailpitMessageSummary = {
  ID: string
  From: { Address: string }
  To: Array<{ Address: string }>
  Subject: string
  Created: string
  Snippet: string
}

// A minimal, hand-rolled SMTP client — this is test-only plumbing
// talking to a local Mailpit instance, not a general-purpose mailer,
// so it only ever needs the handful of commands a single plain-text
// send requires.
export async function sendViaSmtp(from: string, to: string[], subject: string, body: string): Promise<void> {
  const { Socket } = await import('node:net')
  const socket = new Socket()

  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject)
    socket.connect(MAILPIT_SMTP_PORT, MAILPIT_SMTP_HOST, resolve)
  })

  let buffer = ''
  function readResponse(): Promise<string> {
    return new Promise((resolve) => {
      function onData(chunk: Buffer) {
        buffer += chunk.toString('utf8')
        // A multi-line SMTP response's final line starts "code " (space,
        // not '-'); a single-line response is its own final line.
        const lines = buffer.split('\r\n').filter(Boolean)
        const last = lines.at(-1)
        if (last && /^\d{3} /.test(last)) {
          socket.off('data', onData)
          const result = buffer
          buffer = ''
          resolve(result)
        }
      }
      socket.on('data', onData)
    })
  }

  async function command(line: string): Promise<string> {
    socket.write(`${line}\r\n`)
    return readResponse()
  }

  try {
    await readResponse() // the server's own 220 greeting
    await command(`EHLO ${MAILPIT_SMTP_HOST}`)
    await command(`MAIL FROM:<${from}>`)
    for (const recipient of to) await command(`RCPT TO:<${recipient}>`)
    await command('DATA')
    // Dot-stuffing (RFC 5321 §4.5.2): any body line that starts with a
    // "." gets a second one prepended, so it's never mistaken for the
    // lone "." that ends the DATA block below.
    const escapedBody = body.replace(/^\./gm, '..')
    const message = [`From: ${from}`, `To: ${to.join(', ')}`, `Subject: ${subject}`, '', escapedBody].join('\r\n')
    await command(`${message}\r\n.`)
    await command('QUIT')
  } finally {
    socket.end()
  }
}

// `source` names whichever email source is calling (`'fastmail'` /
// `'gmail'`) so a failure surfaces with the right source attribution —
// this plumbing itself is provider-agnostic.
export async function mailpitFetch(source: string, path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(`${MAILPIT_API_URL}${path}`, init)
  if (!response.ok) throw new ConduitSourceError(source, `Mailpit request failed (${response.status})`, response.status)
  return response
}

export function summaryToRecord(message: MailpitMessageSummary): ConduitRecord {
  return {
    id: message.ID,
    fields: {
      from: message.From.Address,
      to: message.To.map((t) => t.Address).join(', '),
      subject: message.Subject,
      body: message.Snippet,
      date: message.Created,
    },
  }
}
