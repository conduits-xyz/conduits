import type { ConduitFields } from './sheets.ts'

// The message body for the email sources (fastmail.ts, gmail.ts): one
// line per submitted field, in order.
export function renderEmailBody(fields: ConduitFields): string {
  return Object.entries(fields)
    .map(([name, value]) => `${name}: ${value ?? ''}`)
    .join('\n')
}
