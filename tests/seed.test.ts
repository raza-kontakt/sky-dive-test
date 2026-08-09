import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '../db/client'
import { attempts, options, questionMeta, questions, sessions, subjects } from '../db/schema'
import { seed } from '../scripts/seed'

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
    expect(db.select().from(attempts).all()).toHaveLength(1)
    const reloaded = db.select().from(questions).where(eq(questions.id, first.id)).get()!
    expect(reloaded.explanation).toBe('hand written')
  })
})
