import * as http from 'node:http'
import { createRequestListener } from 'remix/node-fetch-server'
import { createGatewayRouter, createStaticRouteResolver, problemResponse } from '@conduits/gateway'
import { createGoogleSheetsClient } from '@conduits/conduit'
import { googleSheetsOptionsFromEnv, listLimitsFromEnv } from '@conduits/config'

import { loadConduitConfigs } from './config.ts'
import { gatewayServiceRuntime } from './runtime.ts'

const configPath = process.env.CONDUITS_CONFIG_PATH ?? './conduits.yaml'
const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 8787

// A bad conduits.yaml stops the process (see compileConduits in
// @conduits/config).
const { configs, bindings } = loadConduitConfigs(configPath)
console.log(`[gateway-service] loaded ${configs.size} conduit(s) from ${configPath}`)

const gatewayRouter = createGatewayRouter({
  resolveConfig: async (curi) => configs.get(curi) ?? null,
  resolveRoute: createStaticRouteResolver(bindings),
  runtime: gatewayServiceRuntime,
  listLimits: listLimitsFromEnv(),
  sourceClients: { googleSheets: createGoogleSheetsClient(googleSheetsOptionsFromEnv()) },
})

const server = http.createServer(
  createRequestListener(async (request) => {
    try {
      return await gatewayRouter.fetch(request)
    } catch (error) {
      console.error(error)
      return problemResponse('internal_error')
    }
  }),
)

server.listen(port, () => {
  console.log(`[gateway-service] listening on http://localhost:${port}`)
})

let shuttingDown = false

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  server.close(() => process.exit(0))
  server.closeAllConnections()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
