import * as fs from 'node:fs'

import { compileConduits } from '@conduits/config'
import type { ConduitConfig, RouteBinding } from '@conduits/gateway'

// The suriTypes this runtime can operate (runtime.ts). Kept here, not in
// @conduits/config, which may know more YAML shapes than this runtime
// runs.
const SUPPORTED_SOURCE_TYPES = ['fastmail', 'googleSheets', 'gmail'] as const

export interface LoadedConduits {
  configs: Map<string, ConduitConfig>
  bindings: RouteBinding[]
}

// Read once at startup; edit and restart to reload. A bad config stops
// the process (see compileConduits in @conduits/config).
export function loadConduitConfigs(path: string): LoadedConduits {
  let yamlText: string
  try {
    yamlText = fs.readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`conduits.yaml not found at '${path}' — copy conduits.example.yaml to conduits.yaml (or set CONDUITS_CONFIG_PATH), then fill it in. See README.md.`)
    }
    throw err
  }
  const { configs, bindings } = compileConduits(yamlText, { supportedSourceTypes: SUPPORTED_SOURCE_TYPES })

  const byCuri = new Map<string, ConduitConfig>()
  for (const config of configs) byCuri.set(config.curi, config)
  return { configs: byCuri, bindings }
}
