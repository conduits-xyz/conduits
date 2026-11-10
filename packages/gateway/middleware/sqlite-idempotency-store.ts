import * as fs from 'node:fs'
import * as path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { IdempotencyClaim, IdempotencyStore, StoredResponse } from './idempotency.ts'

// An IdempotencyStore in a SQLite file: shared by the gateway's processes
// on one host that open the same file, and kept over a restart. Expired
// keys are deleted when a key is claimed.
export function createSqliteIdempotencyStore(file: string): IdempotencyStore & { close(): void } {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(file)
  db.exec('pragma journal_mode = WAL')
  db.exec('pragma busy_timeout = 5000')
  db.exec(`
    create table if not exists idempotency_keys (
      scope text not null,
      key text not null,
      fingerprint text not null,
      expires_at integer not null,
      response text,
      primary key (scope, key)
    )
  `)
  const sweep = db.prepare('delete from idempotency_keys where expires_at <= ?')
  const insert = db.prepare('insert into idempotency_keys (scope, key, fingerprint, expires_at) values (?, ?, ?, ?) on conflict (scope, key) do nothing')
  const find = db.prepare('select fingerprint, response from idempotency_keys where scope = ? and key = ?')
  const complete = db.prepare('update idempotency_keys set response = ? where scope = ? and key = ?')
  const release = db.prepare('delete from idempotency_keys where scope = ? and key = ?')

  return {
    async claim(scope, key, fingerprint, nowMs, ttlMs): Promise<IdempotencyClaim> {
      sweep.run(nowMs)
      // One statement, so two processes can't both claim the key.
      if ((insert.run(scope, key, fingerprint, nowMs + ttlMs).changes as number) === 1) return { kind: 'new' }
      const row = find.get(scope, key) as { fingerprint: string; response: string | null } | undefined
      if (!row) return { kind: 'running' }
      if (row.fingerprint !== fingerprint) return { kind: 'reused' }
      return row.response === null ? { kind: 'running' } : { kind: 'replay', response: JSON.parse(row.response) as StoredResponse }
    },
    async complete(scope, key, response) {
      complete.run(JSON.stringify(response), scope, key)
    },
    async release(scope, key) {
      release.run(scope, key)
    },
    close() {
      db.close()
    },
  }
}
