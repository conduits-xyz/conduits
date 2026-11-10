import type { RecordCondition } from '@conduits/conduit'

import { recordEtag } from './etag.ts'
import { problemResponse } from './response.ts'
import type { ConduitConfig } from './types.ts'

const REQUIRED = { detail: 'This conduit needs the ETag of each record a request changes. Read the record, then send its ETag.' }

// The condition of a write to one record, from its If-Match header
// (RFC 9110, 13.1.1): '*' matches any record, else one of the listed
// tags must equal its ETag; a weak tag (W/"…") never does. Undefined
// without the header, or a 428 when the conduit requires it.
export function ifMatchCondition(request: Request, config: ConduitConfig): RecordCondition | undefined | Response {
  const header = request.headers.get('if-match')
  if (header === null) return config.ifMatchRequired ? problemResponse('precondition_required', REQUIRED) : undefined
  if (header.trim() === '*') return () => true
  const tags = header.split(',').map((tag) => tag.trim())
  return (current) => tags.includes(recordEtag(current.fields))
}

// The condition of a bulk write, from the ETag sent with each id
// (undefined where none was sent): undefined when none was sent at all,
// or a 428 when the conduit requires one for every record.
export function bulkCondition(ids: string[], etags: (string | undefined)[], config: ConduitConfig): RecordCondition | undefined | Response {
  if (config.ifMatchRequired && etags.some((etag) => etag === undefined)) return problemResponse('precondition_required', REQUIRED)
  if (etags.every((etag) => etag === undefined)) return undefined
  const expected = new Map(ids.map((id, i) => [id, etags[i]]))
  return (current) => {
    const etag = expected.get(current.id)
    return etag === undefined || etag === recordEtag(current.fields)
  }
}

// The ETags sent with a bulk write's records, one for each (undefined
// where none was sent), or null if one is not a non-empty string.
export function extractEtags(values: unknown[]): (string | undefined)[] | null {
  if (!values.every((value) => value === undefined || (typeof value === 'string' && value !== ''))) return null
  return values as (string | undefined)[]
}
