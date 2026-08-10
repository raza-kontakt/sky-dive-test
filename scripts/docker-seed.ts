// Seeder entry point for the Docker image. The build bundles this to plain JS,
// so the runtime image can populate its SQLite volume without tsx or any dev
// dependency. Paths are env-overridable because the container keeps its copy of
// the bank outside /app/data (that path is a volume mount).
import { getDb } from '../db/client'
import { seed } from './seed'

const bankPath = process.env.BANK_PATH ?? 'data/bank.json'
const explanationsPath = process.env.EXPLANATIONS_PATH ?? 'data/explanations.json'

seed(getDb(), { bankPath, explanationsPath })
  .then(() => console.log(`seeded data/app.db from ${bankPath}`))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
