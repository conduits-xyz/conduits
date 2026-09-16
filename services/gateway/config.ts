import * as fs from 'node:fs'

import { compileConduits } from '@conduits/config'
import type { ConduitConfig } from '@conduits/gateway'

// Every suriType this runtime actually knows how to operate (see
// runtime.ts) — listed here, not in @conduits/config, because that
// package may learn other suriTypes' YAML shapes before this specific
// runtime can operate them.
const SUPPORTED_SOURCE_TYPES = ['fastmail', 'googleSheets', 'gmail'] as const

// Restart-to-reload: this reads the file once, at process start. No
// watcher, no hot reload — see @conduits/config's own compileConduits
// doc on why a bad config fails the whole process rather than serving
// with a partial or stale set of conduits.
export function loadConduitConfigs(path: string): Map<string, ConduitConfig> {
  let yamlText: string
  try {
    yamlText = fs.readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`conduits.yaml not found at '${path}' — copy conduits.example.yaml to conduits.yaml (or set CONDUITS_CONFIG_PATH), then fill it in. See README.md.`)
    }
    throw err
  }
  const configs = compileConduits(yamlText, { supportedSourceTypes: SUPPORTED_SOURCE_TYPES })

  const byCuri = new Map<string, ConduitConfig>()
  for (const config of configs) byCuri.set(config.curi, config)
  return byCuri
}
