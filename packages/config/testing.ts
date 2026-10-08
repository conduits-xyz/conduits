import { FASTMAIL_CAPABILITIES } from '@conduits/conduit'
import { createRecordingSource } from '@conduits/conduit/testing'
import { createGatewayRouter, createStaticRouteResolver, generateRequestId, type GatewayRuntime } from '@conduits/gateway'
import { unreachedThrottle } from '@conduits/gateway/testing'

import { compileConduits } from './compile.ts'

// For tests: a gateway over the Fastmail conduits a conduits.yaml text
// declares, with a source that records what Fastmail would be asked to
// send (`sent`) in place of the real client.
export function createYamlTestGateway(yamlText: string, runtime: GatewayRuntime) {
  const { configs, bindings } = compileConduits(yamlText, { supportedSourceTypes: ['fastmail'] })
  const byCuri = new Map(configs.map((config) => [config.curi, config]))
  const fastmail = createRecordingSource(FASTMAIL_CAPABILITIES)
  const router = createGatewayRouter({
    sourceClients: { fastmail: fastmail.client },
    clock: { now: () => new Date(), monotonicMs: () => performance.now() },
    throttle: unreachedThrottle(),
    trustedForwarders: [],
    requestId: generateRequestId,
    resolveConfig: async (curi) => byCuri.get(curi) ?? null,
    resolveRoute: createStaticRouteResolver(bindings),
    runtime,
    listLimits: { default: 1000, max: 1000 },
  })
  return { router, sent: fastmail.created }
}
