import type { Middleware } from 'remix/router'

import {
  ConduitAuthError,
  ConduitCursorError,
  ConduitPreconditionError,
  ConduitRateLimitError,
  ConduitSourceError,
  ConduitUnknownFieldError,
  reverseFieldMap,
} from '@conduits/conduit'
import type { GatewayContext } from '../context.ts'
import type { GatewayRuntime } from '../types.ts'
import { pointerSegment, problemResponse, type FieldError } from '../response.ts'
import { conduitConfigContext } from './conduit-config.ts'
import { jsonBodyContext } from './body.ts'
import { NoUsableCredentialError } from './source-client.ts'
import { recordEtag } from '../etag.ts'

// One error per unknown field, under the name the client sent, pointing
// at each record that has it. checkKnownFields reports the client's
// names; a source reports column names, which fieldMap maps back.
function unknownFieldResponse(err: ConduitUnknownFieldError, context: GatewayContext): Response {
  const body = context.get(jsonBodyContext)
  const bulk = Array.isArray(body.records)
  const sentFields = bulk
    ? (body.records as { fields?: Record<string, unknown> }[]).map((record) => record?.fields ?? {})
    : [(body.fields as Record<string, unknown> | undefined) ?? {}]
  const sent = new Set(sentFields.flatMap((fields) => Object.keys(fields)))
  const fieldMap = context.get(conduitConfigContext)?.suriConfig.fieldMap
  const toClientName = fieldMap ? reverseFieldMap(fieldMap) : {}
  const names = err.fieldNames.map((name) => (sent.has(name) ? name : (toClientName[name] ?? name)))

  const errors: FieldError[] = names.flatMap((field) =>
    sentFields.flatMap((fields, index) =>
      field in fields
        ? [{ code: 'unknown_field' as const, field, pointer: `${bulk ? `/records/${index}` : ''}/fields/${pointerSegment(field)}`, detail: `Unknown field: '${field}'` }]
        : [],
    ),
  )
  const list = names.map((name) => `'${name}'`).join(', ')
  return problemResponse('unknown_field', { detail: `The conduit has no ${names.length === 1 ? 'field' : 'fields'} ${list}.`, errors })
}

// 412 for a write whose records changed since the caller read them. A
// write to one record gives that record's current ETag in the header; a
// bulk write gives one error per changed record, pointing at its etag.
function preconditionFailedResponse(err: ConduitPreconditionError, context: GatewayContext): Response {
  const body = context.get(jsonBodyContext)
  const current = new Map(err.current.map((record) => [record.id, recordEtag(record.fields)]))
  if (Array.isArray(body.records) || Array.isArray(body.ids)) {
    const ids = Array.isArray(body.ids) ? (body.ids as string[]) : (body.records as { id: string }[]).map((record) => record.id)
    const at = Array.isArray(body.ids) ? (i: number) => `/etags/${i}` : (i: number) => `/records/${i}/etag`
    const errors: FieldError[] = ids.flatMap((id, i) => {
      const etag = current.get(id)
      return etag === undefined ? [] : [{ code: 'precondition_failed' as const, pointer: at(i), detail: `Record ${id} has changed. Its ETag is now ${etag}.` }]
    })
    return problemResponse('precondition_failed', { detail: 'A record has changed since you read it. Nothing was written.', errors })
  }
  return problemResponse('precondition_failed', { detail: 'The record has changed since you read it. Nothing was written. Read it again.', headers: { etag: [...current.values()][0]! } })
}

// Wraps the action, which opens the source through loadConduitTable.
// Turns ConduitUnknownFieldError (400), ConduitCursorError (400
// unknown_cursor), ConduitPreconditionError (412), NoUsableCredentialError,
// ConduitAuthError and ConduitSourceError (502) and
// ConduitRateLimitError (503 with Retry-After: the source's limit, not
// this caller's) into problem responses; other errors pass through.
export function handleSourceErrors(runtime: GatewayRuntime): Middleware {
  return async (context, next) => {
    try {
      return await next()
    } catch (err) {
      if (err instanceof ConduitUnknownFieldError) return unknownFieldResponse(err, context as GatewayContext)

      if (err instanceof ConduitPreconditionError) return preconditionFailedResponse(err, context as GatewayContext)

      if (err instanceof ConduitCursorError) return problemResponse('unknown_cursor', { detail: 'The record this cursor follows is gone. Read again from the first page.' })

      if (err instanceof NoUsableCredentialError) return problemResponse('source_unavailable', { detail: err.message })

      if (err instanceof ConduitAuthError) {
        // The credential was rejected: let the runtime clean it up so the
        // next request fails without calling the source. What that means
        // per suriType is the runtime's choice (a no-op for Fastmail).
        const config = context.get(conduitConfigContext)
        if (config) await runtime.invalidateCredential(config)
        return problemResponse('source_unavailable', { detail: 'The source refused the conduit owner\'s credential.' })
      }

      if (err instanceof ConduitRateLimitError) {
        return problemResponse('source_busy', { detail: 'The source is busy. Wait, then retry.', retryAfter: err.retryAfterSeconds })
      }

      if (err instanceof ConduitSourceError) {
        // Another non-2xx (a deleted table, a 5xx); logged.
        console.error(`${err.source} request failed (${err.status}): ${err.message}`)
        return problemResponse('source_unavailable')
      }

      throw err
    }
  }
}
