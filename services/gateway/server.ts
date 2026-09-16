import * as http from 'node:http'
import { createRequestListener } from 'remix/node-fetch-server'
import { createGatewayRouter } from '@conduits/gateway'

import { loadConduitConfigs } from './config.ts'
import { gatewayServiceRuntime } from './runtime.ts'

const configPath = process.env.CONDUITS_CONFIG_PATH ?? './conduits.yaml'
const port = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 8787

// Whole-file, fail-fast: a bad conduits.yaml must not start the process
// at all — see @conduits/config's own compileConduits doc.
const configs = loadConduitConfigs(configPath)
console.log(`[gateway-service] loaded ${configs.size} conduit(s) from ${configPath}`)

const gatewayRouter = createGatewayRouter({
  resolveConfig: async (curi) => configs.get(curi) ?? null,
  runtime: gatewayServiceRuntime,
})

const server = http.createServer(
  createRequestListener(async (request) => {
    try {
      return await gatewayRouter.fetch(request)
    } catch (error) {
      console.error(error)
      return new Response('Internal Server Error', { status: 500 })
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
