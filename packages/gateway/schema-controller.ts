import { createController } from 'remix/router'

import { gatewayRoutes } from './routes.ts'
import type { GatewayContext } from './context.ts'
import { createSchemaGatewayMiddleware, type GatewayDeps } from './pipeline.ts'
import { jsonResponse } from './response.ts'
import { conduitTableContext } from './middleware/source-client.ts'
import { conduitConfigContext } from './middleware/conduit-config.ts'
import { reverseFieldMap } from '@conduits/conduit'

// Its own controller with its own middleware pipeline
// (createSchemaGatewayMiddleware, not createGatewayMiddleware) — this
// route always requires a bearer token, unlike every other
// createGatewayController action.
export function createGatewaySchemaController(deps: GatewayDeps) {
  return createController<typeof gatewayRoutes.schema, GatewayContext, ReturnType<typeof createSchemaGatewayMiddleware>>(
    gatewayRoutes.schema,
    {
      middleware: createSchemaGatewayMiddleware(deps),
      actions: {
        async read(context) {
          const config = context.get(conduitConfigContext)
          const table = context.get(conduitTableContext)
          const { fieldMap } = config.suriConfig
          const bySourceName = fieldMap ? reverseFieldMap(fieldMap) : undefined

          const fields = await table.describeFields()
          return jsonResponse({
            fields: fields.map((field) => ({ ...field, name: bySourceName?.[field.name] ?? field.name })),
          })
        },
      },
    },
  )
}
