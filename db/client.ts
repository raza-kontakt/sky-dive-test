import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL || 'postgres://localhost/app'

const client = postgres(connectionString)
export const db = drizzle({ client, schema })

export async function closeDb() {
  await client.end()
}

export type Db = typeof db
