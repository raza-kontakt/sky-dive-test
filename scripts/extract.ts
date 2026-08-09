import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseTrainer } from './lib/parse-trainer'

const SOURCE = 'data/source/DFV_Theory_Trainer.html'
const IMAGE_DIR = 'public/q'

const parsed = parseTrainer(readFileSync(SOURCE, 'utf8'))

mkdirSync('data', { recursive: true })
mkdirSync(IMAGE_DIR, { recursive: true })

for (const [key, dataUri] of Object.entries(parsed.images)) {
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1)
  writeFileSync(`${IMAGE_DIR}/${key}.png`, Buffer.from(base64, 'base64'))
}

writeFileSync(
  'data/bank.json',
  JSON.stringify({ subjects: parsed.subjects, questions: parsed.questions }, null, 2),
)

console.log(
  `wrote data/bank.json (${parsed.questions.length} questions, ${parsed.subjects.length} subjects) ` +
    `and ${Object.keys(parsed.images).length} images to ${IMAGE_DIR}/`,
)
