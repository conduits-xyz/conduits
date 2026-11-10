import * as http from 'node:http'
import * as path from 'node:path'
import { createRequestListener } from 'remix/node-fetch-server'
import { createGatewayRouter, createMemoryIdempotencyStore, createMemoryThrottleStore, createSqliteIdempotencyStore, createSqliteThrottleStore, createStaticRouteResolver, generateRequestId, problemResponse } from '@conduits/gateway'
import { googleSheetsOptionsFromEnv, idempotencyTtlMsFromEnv, listLimitsFromEnv, stateDirFromEnv, throttleLimitsFromEnv, trustedForwardersFromEnv } from '@conduits/config'

import { credentialStorePath, loadConduitConfigs } from './config.ts'
import { createSourceClients, googleTokenOptions } from './providers.ts'
import { createGatewayServiceRuntime, missingGoogleGrants } from './runtime.ts'

// The composition root: the only code that reads the platform
// environment.
const platform = process.env
const configPath = platform.CONDUITS_CONFIG_PATH ?? './conduits.yaml'
const port = platform.PORT ? Number.parseInt(platform.PORT, 10) : 8787

// A bad conduits.yaml stops the process (see compileConduits in
// @conduits/config).
const { configs, bindings } = loadConduitConfigs(configPath, platform)
console.log(`[gateway-service] loaded ${configs.size} conduit(s) from ${configPath}`)
// A conduit without its Google grant is served, and fails each request
// with 502 until the grant is added; this says so now.
for (const missing of missingGoogleGrants(configs.values(), credentialStorePath(platform))) console.warn(`[gateway-service] ${missing}`)

// The throttle's counts and the idempotency keys: in files in
// CONDUITS_STATE_DIR, shared by this host's gateway processes and kept
// over a restart; in memory without it.
const stateDir = stateDirFromEnv(platform)

const gatewayRouter = createGatewayRouter({
  resolveConfig: async (curi) => configs.get(curi) ?? null,
  resolveRoute: createStaticRouteResolver(bindings),
  runtime: createGatewayServiceRuntime(credentialStorePath(platform), googleTokenOptions, platform),
  listLimits: listLimitsFromEnv(platform),
  sourceClients: createSourceClients(googleSheetsOptionsFromEnv(platform)),
  clock: { now: () => new Date(), monotonicMs: () => performance.now() },
  throttle: { limits: throttleLimitsFromEnv(platform), store: stateDir ? createSqliteThrottleStore(path.join(stateDir, 'throttle.db')) : createMemoryThrottleStore() },
  idempotency: {
    store: stateDir ? createSqliteIdempotencyStore(path.join(stateDir, 'idempotency.db')) : createMemoryIdempotencyStore(),
    ttlMs: idempotencyTtlMsFromEnv(platform),
  },
  trustedForwarders: trustedForwardersFromEnv(platform),
  requestId: generateRequestId,
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

// On every network interface: reachable from other computers unless a
// firewall or a reverse proxy in front of it decides otherwise.
server.listen(port, () => {
  console.log(`[gateway-service] listening on port ${port}, on every network interface (http://localhost:${port} on this computer)`)
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
