import type { MailMessage } from './types.ts'

// RFC 5322 messages, for transports that take one whole (Gmail). Bodies
// are UTF-8, base64-encoded, so no line is too long and no byte is
// misread.

// A reason the message can't be sent as given, or null. Header values
// must not contain line breaks, which would let a value add headers.
export function messageProblem(from: string | undefined, message: MailMessage): string | null {
  if (message.to.length === 0) return 'no recipients'
  const headerValues = [from ?? '', ...message.to, message.subject, message.replyTo ?? '']
  if (headerValues.some((value) => /[\r\n]/.test(value))) return 'a header value contains a line break'
  if ([...message.to, ...(from ? [from] : []), ...(message.replyTo ? [message.replyTo] : [])].some((address) => !/^[^\s@]+@[^\s@]+$/.test(address))) {
    return 'an address is not of the form name@domain'
  }
  return null
}

// RFC 2047 encoded-word, only when the value isn't plain ASCII.
export function encodeHeader(value: string): string {
  return /^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`
}

// RFC 5322 date-time, in UTC.
export function formatDate(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${days[date.getUTCDay()]}, ${pad(date.getUTCDate())} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`
}

// `<id@domain>`, with the sender's domain when there is one.
export function messageIdFor(id: string, from: string | undefined): string {
  return `<${id}@${from?.split('@')[1] ?? 'localhost'}>`
}

function base64Lines(text: string): string {
  return (Buffer.from(text, 'utf8').toString('base64').match(/.{1,76}/g) ?? []).join('\r\n')
}

function part(type: 'text/plain' | 'text/html', body: string): string {
  return [`Content-Type: ${type}; charset="UTF-8"`, 'Content-Transfer-Encoding: base64', '', base64Lines(body)].join('\r\n')
}

export function buildMessage(input: { from: string | undefined; message: MailMessage; date: Date; messageId: string; boundary: string }): string {
  const { from, message } = input
  const headers = [
    ...(from ? [`From: ${from}`] : []),
    `To: ${message.to.join(', ')}`,
    ...(message.replyTo ? [`Reply-To: ${message.replyTo}`] : []),
    `Subject: ${encodeHeader(message.subject)}`,
    `Date: ${formatDate(input.date)}`,
    `Message-ID: ${input.messageId}`,
    'MIME-Version: 1.0',
  ]
  if (message.html === undefined) return [...headers, part('text/plain', message.text)].join('\r\n')
  return [
    ...headers,
    `Content-Type: multipart/alternative; boundary="${input.boundary}"`,
    '',
    `--${input.boundary}`,
    part('text/plain', message.text),
    `--${input.boundary}`,
    part('text/html', message.html),
    `--${input.boundary}--`,
    '',
  ].join('\r\n')
}
