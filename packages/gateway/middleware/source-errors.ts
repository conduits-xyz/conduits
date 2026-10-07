import type { Middleware } from 'remix/router'

import {
  ConduitAuthError,
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

// Wraps the action, which opens the source through loadConduitTable.
// Turns ConduitUnknownFieldError (400), NoUsableCredentialError,
// ConduitAuthError and ConduitSourceError (502) and
// ConduitRateLimitError (503 with Retry-After: the source's limit, not
// this caller's) into problem responses; other errors pass through.
export function handleSourceErrors(runtime: GatewayRuntime): Middleware {
  return async (context, next) => {
    try {
      return await next()
    } catch (err) {
      if (err instanceof ConduitUnknownFieldError) return unknownFieldResponse(err, context as GatewayContext)

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
