import * as fs from 'node:fs'
import * as path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type { ThrottleStore } from './throttle.ts'

// A ThrottleStore in a SQLite file: the gateway's processes on one host
// that open the same file share its counts and bans, and they are kept
// over a restart. Ended windows and bans are deleted once per window.
export function createSqliteThrottleStore(file: string): ThrottleStore & { close(): void } {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(file)
  db.exec('pragma journal_mode = WAL')
  db.exec('pragma busy_timeout = 5000')
  db.exec(`
    create table if not exists throttle_counts (
      key text not null,
      window_start integer not null,
      window_end integer not null,
      count integer not null,
      primary key (key, window_start)
    );
    create table if not exists throttle_bans (key text primary key, until integer not null);
  `)
  const sweepCounts = db.prepare('delete from throttle_counts where window_end <= ?')
  const sweepBans = db.prepare('delete from throttle_bans where until <= ?')
  const increment = db.prepare(`
    insert into throttle_counts (key, window_start, window_end, count) values (?, ?, ?, 1)
    on conflict (key, window_start) do update set count = count + 1
    returning count
  `)
  const bannedUntil = db.prepare('select until from throttle_bans where key = ? and until > ?')
  const ban = db.prepare(`
    insert into throttle_bans (key, until) values (?, ?)
    on conflict (key) do update set until = max(until, excluded.until)
  `)
  let sweptWindowStartMs = -Infinity

  return {
    async increment(key, windowStartMs, windowMs) {
      if (windowStartMs > sweptWindowStartMs) {
        sweptWindowStartMs = windowStartMs
        sweepCounts.run(windowStartMs)
        sweepBans.run(windowStartMs)
      }
      return Number((increment.get(key, windowStartMs, windowStartMs + windowMs) as { count: number }).count)
    },
    async bannedUntil(key, nowMs) {
      const row = bannedUntil.get(key, nowMs) as { until: number } | undefined
      return row ? Number(row.until) : null
    },
    async ban(key, untilMs) {
      ban.run(key, untilMs)
    },
    close() {
      db.close()
    },
  }
}
