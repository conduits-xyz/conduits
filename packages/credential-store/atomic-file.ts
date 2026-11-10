import * as fs from 'node:fs'
import * as path from 'node:path'

// Best effort: some filesystems (notably on Windows) lack POSIX modes,
// and that mustn't stop the write.
function chmodBestEffort(target: string, mode: number): void {
  try {
    fs.chmodSync(target, mode)
  } catch {
    // Unsupported here; see above.
  }
}

// Writes a temp file in the same directory, sets its permissions, and
// renames it over the path, so a reader sees the old file or the new
// one, never part of one.
export function writeJsonFileAtomic(filePath: string, value: unknown): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  chmodBestEffort(dir, 0o700)

  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  fs.writeFileSync(tmpPath, JSON.stringify(value, null, 2), { mode: 0o600 })
  chmodBestEffort(tmpPath, 0o600)
  fs.renameSync(tmpPath, filePath)
}

// A missing file reads as `fallback`.
export function readJsonFileOrDefault<T>(filePath: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw err
  }
}
