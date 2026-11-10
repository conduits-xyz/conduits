import { pointerSegment, problemResponse, type FieldError } from './response.ts'

// The members a request body may have: `allowed` at its top, and
// `recordAllowed` in each item of `records`. Returns one error for each
// other member, so a caller refuses them all and never ignores one.
export function findUnknownMembers(
  body: object,
  allowed: readonly string[],
  recordAllowed: readonly string[] = [],
): FieldError<'unknown_member'>[] {
  const errors: FieldError<'unknown_member'>[] = []
  const check = (object: unknown, names: readonly string[], prefix: string) => {
    if (typeof object !== 'object' || object === null || Array.isArray(object)) return
    for (const name of Object.keys(object)) {
      if (!names.includes(name)) errors.push({ code: 'unknown_member', pointer: `${prefix}/${pointerSegment(name)}`, detail: `Unknown member: '${name}'` })
    }
  }
  check(body, allowed, '')
  const records = (body as { records?: unknown }).records
  if (allowed.includes('records') && Array.isArray(records)) records.forEach((record, index) => check(record, recordAllowed, `/records/${index}`))
  return errors
}

// The members each write accepts (docs/gateway-api.md, "Record shape").
export function refuseUnknownMembers(body: Record<string, unknown>, allowed: readonly string[], recordAllowed: readonly string[] = []): Response | null {
  const errors = findUnknownMembers(body, allowed, recordAllowed)
  if (errors.length === 0) return null
  return problemResponse('unknown_member', { detail: `The body has ${errors.length === 1 ? 'a member' : 'members'} this request does not accept.`, errors })
}
