import { ConduitSourceError, type ConduitRecord } from './sheets.ts'

// Test-only code for the NODE_ENV=test clients of the email sources
// (fastmail.ts, gmail.ts): they send through Mailpit, a local SMTP
// server with a REST API, because delivery is what's tested. Not
// exported from index.ts.

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

// A minimal SMTP client: the commands one plain-text message needs.
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
        // The last line of a reply starts "code " (a space, not '-').
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
    // Dot-stuffing (RFC 5321 §4.5.2): a body line starting with "." gets
    // another, so it can't end the DATA block.
    const escapedBody = body.replace(/^\./gm, '..')
    const message = [`From: ${from}`, `To: ${to.join(', ')}`, `Subject: ${subject}`, '', escapedBody].join('\r\n')
    await command(`${message}\r\n.`)
    await command('QUIT')
  } finally {
    socket.end()
  }
}

// `source` ('fastmail' or 'gmail') is put on any error thrown.
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
