import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { and, eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '../db/client'
import { attempts, options, questionMeta, questions, sessions, subjects } from '../db/schema'
import type { BankQuestion } from '../scripts/lib/parse-trainer'
import { seed, type ExplanationRecord } from '../scripts/seed'

const dir = mkdtempSync(join(tmpdir(), 'dfv-seed-'))
const file = join(dir, 'test.db')
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('seed', () => {
  it('loads the full bank, preserves user data, and is idempotent', async () => {
    const db = getDb(file)

    await seed(db, { bankPath: 'data/bank.json' })
    expect(db.select().from(questions).all()).toHaveLength(513)
    expect(db.select().from(subjects).all()).toHaveLength(7)
    expect(db.select().from(options).all()).toHaveLength(513 * 4)
    expect(db.select().from(questions).all().filter((q) => q.imagePath !== null)).toHaveLength(15)

    // Simulate user activity and an edited explanation.
    const first = db.select().from(questions).all()[0]
    db.insert(questionMeta)
      .values({ questionId: first.id, flagged: true, note: 'my note', updatedAt: 1 })
      .run()
    db.update(questions)
      .set({ explanation: 'hand written', explanationEditedAt: 1 })
      .where(eq(questions.id, first.id))
      .run()
    const session = db
      .insert(sessions)
      .values({ mode: 'drill', configJson: '{}', startedAt: 1 })
      .returning()
      .get()
    db.insert(attempts)
      .values({ sessionId: session.id, questionId: first.id, chosenKey: 'a', isCorrect: true, answeredAt: 1 })
      .run()

    await seed(db, { bankPath: 'data/bank.json' })

    expect(db.select().from(questions).all()).toHaveLength(513)
    expect(db.select().from(options).all()).toHaveLength(513 * 4)
    expect(db.select().from(questionMeta).all()).toHaveLength(1)
    expect(db.select().from(questionMeta).all()[0].note).toBe('my note')
    expect(db.select().from(questionMeta).all()[0].flagged).toBe(true)
    expect(db.select().from(attempts).all()).toHaveLength(1)
    const reloadedAttempt = db.select().from(attempts).all()[0]
    expect(reloadedAttempt.chosenKey).toBe('a')
    expect(reloadedAttempt.isCorrect).toBe(true)
    const reloaded = db.select().from(questions).where(eq(questions.id, first.id)).get()!
    expect(reloaded.explanation).toBe('hand written')
  })
})

describe('seed with explanations', () => {
  it('populates explanation and why-wrong text, and clears why-wrong when the correct answer changes', async () => {
    const dir2 = mkdtempSync(join(tmpdir(), 'dfv-seed-explanations-'))
    const file2 = join(dir2, 'test.db')
    const db = getDb(file2)

    const bank: { subjects: string[]; questions: BankQuestion[] } = JSON.parse(readFileSync('data/bank.json', 'utf8'))
    const target = bank.questions[0]
    const wrongLetters = target.options.map((o) => o.letter).filter((l) => l !== target.correctKey)

    const explanationsPath = join(dir2, 'explanations.json')
    const record: ExplanationRecord = {
      subject: target.subject,
      number: target.number,
      explanation: 'why the correct answer is correct',
      whyWrong: wrongLetters.map((letter) => ({ letter, text: `why ${letter} is wrong` })),
    }
    writeFileSync(explanationsPath, JSON.stringify({ records: [record] }))

    await seed(db, { bankPath: 'data/bank.json', explanationsPath })

    const subjectRow = db.select().from(subjects).where(eq(subjects.name, target.subject)).get()!
    const questionRow = db
      .select()
      .from(questions)
      .where(and(eq(questions.subjectId, subjectRow.id), eq(questions.number, target.number)))
      .get()!
    expect(questionRow.explanation).toBe('why the correct answer is correct')

    const optionRows = db.select().from(options).where(eq(options.questionId, questionRow.id)).all()
    for (const letter of wrongLetters) {
      expect(optionRows.find((o) => o.letter === letter)!.whyWrong).toBe(`why ${letter} is wrong`)
    }
    expect(optionRows.find((o) => o.letter === target.correctKey)!.whyWrong).toBeNull()

    // Simulate a bank correction that flips which letter is correct for this question.
    // The newly-correct option's why-wrong text must be cleared, not left stale.
    const newCorrectKey = wrongLetters[0]
    const correctedBank = structuredClone(bank)
    const correctedTarget = correctedBank.questions.find(
      (q) => q.subject === target.subject && q.number === target.number,
    )!
    correctedTarget.correctKey = newCorrectKey
    const correctedBankPath = join(dir2, 'bank-corrected.json')
    writeFileSync(correctedBankPath, JSON.stringify(correctedBank))

    await seed(db, { bankPath: correctedBankPath, explanationsPath })

    const reloadedQuestion = db.select().from(questions).where(eq(questions.id, questionRow.id)).get()!
    expect(reloadedQuestion.correctKey).toBe(newCorrectKey)

    const reloadedOptions = db.select().from(options).where(eq(options.questionId, questionRow.id)).all()
    expect(reloadedOptions.find((o) => o.letter === newCorrectKey)!.whyWrong).toBeNull()

    rmSync(dir2, { recursive: true, force: true })
  })
})
