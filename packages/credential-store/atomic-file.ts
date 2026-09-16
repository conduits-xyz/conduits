import * as fs from 'node:fs'
import * as path from 'node:path'

// Best-effort permission tightening — some filesystems (notably on
// Windows) don't support POSIX mode bits the same way; a failure here
// must never block the actual write, only the permission hardening.
function chmodBestEffort(target: string, mode: number): void {
  try {
    fs.chmodSync(target, mode)
  } catch {
    // Not supported on this filesystem — see doc above.
  }
}

// Atomic: write to a temp file in the same directory (so the rename
// below is on the same filesystem, hence atomic), lock down its
// permissions, then rename over the real path. A crash or concurrent
// read mid-write can never observe a partially-written file — either
// the old complete file or the new complete file, never neither/a
// fragment. Shared by every local credential/state store a gateway
// runtime (self-hosted or managed) keeps on disk.
export function writeJsonFileAtomic(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodBestEffort(dir, 0o700)

  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), { mode: 0o600 })
  chmodBestEffort(tmpPath, 0o600)
  fs.renameSync(tmpPath, filePath)
}

// A missing file reads as `fallback` — every store built on this
// treats "never written yet" as empty, not an error.
export function readJsonFileOrDefault<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw err
  }
}
