import type { ConduitFields } from './sheets.ts'

// Shared by every email-shaped source (fastmail.ts, gmail.ts) — the
// whole message body, one line per submitted field, in submission
// order.
export function renderEmailBody(fields: ConduitFields): string {
  return Object.entries(fields)
    .map(([name, value]) => `${name}: ${value ?? ''}`)
    .join('\n')
}
