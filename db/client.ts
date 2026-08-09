import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export const DEFAULT_DB_FILE = 'data/app.db'

export function getDb(file: string = DEFAULT_DB_FILE) {
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle({ client: sqlite, schema })
}

export type Db = ReturnType<typeof getDb>
