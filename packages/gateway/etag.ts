import { createHash } from 'node:crypto'
import { BASE31_ALPHABET as ALPHABET, wrapRecord, type ConduitRecord, type WireRecord } from '@conduits/conduit'

import { canonicalJson } from './canonical-json.ts'
import { toClientFields } from './field-values.ts'
import { jsonResponse } from './response.ts'
import type { ConduitConfig } from './types.ts'

// 128 bits of the hash, as 26 base-31 symbols.
const ETAG_BITS = 128n
const ETAG_LENGTH = 26

// A record's ETag (docs/gateway-api.md, "ETags and If-Match"): a strong
// entity tag from a SHA-256 of its fields as the source holds them. An
// empty field (null) is left out, since an empty cell and a missing
// column read the same, so a record has the same ETag in a write's
// response as in a later read.
export function recordEtag(fields: Record<string, unknown>): string {
  const present = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined))
  let value = BigInt(`0x${createHash('sha256').update(canonicalJson(present)).digest('hex')}`) >> (256n - ETAG_BITS)
  let text = ''
  for (let i = 0; i < ETAG_LENGTH; i++) {
    text = ALPHABET[Number(value % 31n)] + text
    value /= 31n
  }
  return `"${text}"`
}

// A record as a response gives it: its fields as the client names and
// types them, and its ETag.
export function toWireRecord(record: ConduitRecord, config: ConduitConfig): WireRecord & { etag: string } {
  return { ...wrapRecord({ id: record.id, fields: toClientFields(record.fields, config) }), etag: recordEtag(record.fields) }
}

// One record, with its ETag also in the header.
export function recordResponse(record: ConduitRecord, config: ConduitConfig, status = 200): Response {
  const wire = toWireRecord(record, config)
  return jsonResponse(wire, status, { etag: wire.etag })
}
