'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { attempts, questionMeta, questions, sessions } from '@/db/schema'
import { selectDrill, selectExam } from './exam'
import { getSelectablePool, listSubjects, type SessionConfig } from './queries'

const db = getDb()

function createSession(mode: string, config: SessionConfig) {
  return db
    .insert(sessions)
    .values({ mode, configJson: JSON.stringify(config), startedAt: Date.now() })
    .returning()
    .get().id
}

export async function createDrillSession(input: {
  count: number
  subject?: string
  source: 'all' | 'flagged' | 'missed'
}) {
  const pool = getSelectablePool({ subject: input.subject, source: input.source })
  if (pool.length === 0) throw new Error('No questions match that selection.')
  const questionIds = selectDrill(pool, { count: input.count, seed: Date.now() })
  return createSession('drill', { questionIds, instantFeedback: true })
}

export async function createExamSession() {
  const pool = getSelectablePool({ source: 'all' })
  if (pool.length === 0) throw new Error('No questions available for an exam.')
  const { ids, shortSubjects } = selectExam(pool, {
    seed: Date.now(),
    subjects: listSubjects().map((s) => s.name),
  })
  return createSession('exam', { questionIds: ids, instantFeedback: false, shortSubjects })
}

export async function recordAnswer(input: {
  sessionId: number
  questionId: number
  chosenKey: string
}) {
  const question = db.select().from(questions).where(eq(questions.id, input.questionId)).get()
  if (!question) throw new Error(`Unknown question ${input.questionId}`)

  const isCorrect = question.correctKey === input.chosenKey
  const existing = db
    .select()
    .from(attempts)
    .where(and(eq(attempts.sessionId, input.sessionId), eq(attempts.questionId, input.questionId)))
    .get()

  if (existing) {
    db.update(attempts)
      .set({ chosenKey: input.chosenKey, isCorrect, answeredAt: Date.now() })
      .where(eq(attempts.id, existing.id))
      .run()
  } else {
    db.insert(attempts)
      .values({
        sessionId: input.sessionId,
        questionId: input.questionId,
        chosenKey: input.chosenKey,
        isCorrect,
        answeredAt: Date.now(),
      })
      .run()
  }
  revalidatePath(`/test/${input.sessionId}`)
}

export async function finishSession(sessionId: number) {
  db.update(sessions).set({ finishedAt: Date.now() }).where(eq(sessions.id, sessionId)).run()
  revalidatePath(`/results/${sessionId}`)
}

export async function toggleFlag(questionId: number) {
  const existing = db.select().from(questionMeta).where(eq(questionMeta.questionId, questionId)).get()
  const flagged = !(existing?.flagged ?? false)
  if (existing) {
    db.update(questionMeta)
      .set({ flagged, updatedAt: Date.now() })
      .where(eq(questionMeta.questionId, questionId))
      .run()
  } else {
    db.insert(questionMeta).values({ questionId, flagged, note: null, updatedAt: Date.now() }).run()
  }
  revalidatePath('/flagged')
  return flagged
}

export async function saveNote(questionId: number, note: string) {
  const existing = db.select().from(questionMeta).where(eq(questionMeta.questionId, questionId)).get()
  if (existing) {
    db.update(questionMeta)
      .set({ note, updatedAt: Date.now() })
      .where(eq(questionMeta.questionId, questionId))
      .run()
  } else {
    db.insert(questionMeta).values({ questionId, flagged: false, note, updatedAt: Date.now() }).run()
  }
  revalidatePath(`/question/${questionId}`)
}

export async function saveExplanation(questionId: number, explanation: string) {
  // A blank submission clears the explanation rather than marking it user-edited,
  // so a future `npm run explain` + seed can still fill it in. Only a genuinely
  // non-blank save is treated as a protected, hand-written explanation.
  const isBlank = explanation.trim() === ''
  db.update(questions)
    .set(
      isBlank
        ? { explanation: null, explanationEditedAt: null }
        : { explanation, explanationEditedAt: Date.now() },
    )
    .where(eq(questions.id, questionId))
    .run()
  revalidatePath(`/question/${questionId}`)
}
