import { existsSync, readFileSync } from 'node:fs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { and, eq } from 'drizzle-orm'
import { getDb, type Db } from '../db/client'
import { options, questions, subjects } from '../db/schema'
import type { BankQuestion } from './lib/parse-trainer'

type Bank = { subjects: string[]; questions: BankQuestion[] }

export type ExplanationRecord = {
  subject: string
  number: number
  explanation: string
  whyWrong: { letter: string; text: string }[]
}

export function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function seed(db: Db, opts: { bankPath: string; explanationsPath?: string }) {
  migrate(db, { migrationsFolder: 'drizzle' })

  const bank: Bank = JSON.parse(readFileSync(opts.bankPath, 'utf8'))

  const explanations = new Map<string, ExplanationRecord>()
  if (opts.explanationsPath && existsSync(opts.explanationsPath)) {
    const parsed: { records: ExplanationRecord[] } = JSON.parse(readFileSync(opts.explanationsPath, 'utf8'))
    for (const record of parsed.records) explanations.set(`${record.subject}#${record.number}`, record)
  }

  const subjectIds = new Map<string, number>()
  for (const name of bank.subjects) {
    const existing = db.select().from(subjects).where(eq(subjects.name, name)).get()
    if (existing) {
      subjectIds.set(name, existing.id)
      continue
    }
    const inserted = db.insert(subjects).values({ name, slug: slugify(name) }).returning().get()
    subjectIds.set(name, inserted.id)
  }

  for (const q of bank.questions) {
    const subjectId = subjectIds.get(q.subject)!
    const explanation = explanations.get(`${q.subject}#${q.number}`)
    const imagePath = q.imageKey ? `/q/${q.imageKey}.png` : null

    const existing = db
      .select()
      .from(questions)
      .where(and(eq(questions.subjectId, subjectId), eq(questions.number, q.number)))
      .get()

    let questionId: number
    if (existing) {
      questionId = existing.id
      // Never clobber an explanation the user has edited.
      const nextExplanation =
        existing.explanationEditedAt !== null ? existing.explanation : (explanation?.explanation ?? existing.explanation)
      db.update(questions)
        .set({ stem: q.stem, imagePath, correctKey: q.correctKey, explanation: nextExplanation })
        .where(eq(questions.id, questionId))
        .run()
    } else {
      questionId = db
        .insert(questions)
        .values({
          subjectId,
          number: q.number,
          stem: q.stem,
          imagePath,
          correctKey: q.correctKey,
          explanation: explanation?.explanation ?? null,
          explanationEditedAt: null,
        })
        .returning()
        .get().id
    }

    const existingOptions = db.select().from(options).where(eq(options.questionId, questionId)).all()
    for (const opt of q.options) {
      const isCorrect = opt.letter === q.correctKey
      const row = existingOptions.find((o) => o.letter === opt.letter)
      // Fresh data for this specific letter, if this run's explanations cover it.
      const freshWhyWrong = explanation?.whyWrong.find((w) => w.letter === opt.letter)?.text

      // The correct option must always end up with no why-wrong text, even if a bank
      // correction just made it correct and it still has stale text stored. Otherwise,
      // write fresh explanation text when this run has it, and leave the stored value
      // untouched when it doesn't (e.g. no explanations file yet).
      const whyWrong = isCorrect ? null : (freshWhyWrong ?? row?.whyWrong ?? null)

      if (row) {
        db.update(options)
          .set({ text: opt.text, whyWrong })
          .where(eq(options.id, row.id))
          .run()
      } else {
        db.insert(options).values({ questionId, letter: opt.letter, text: opt.text, whyWrong }).run()
      }
    }
  }
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seed(getDb(), { bankPath: 'data/bank.json', explanationsPath: 'data/explanations.json' })
    .then(() => console.log('seeded data/app.db'))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
