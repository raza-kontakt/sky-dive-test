'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { attempts, questionMeta, questions, sessions } from '@/db/schema'
import { selectDrill, selectExam } from './exam'
import { getSelectablePool, listSubjects, type SessionConfig } from './queries'

async function createSession(mode: string, config: SessionConfig) {
  const result = await db
    .insert(sessions)
    .values({ mode, configJson: JSON.stringify(config), startedAt: Date.now() })
    .returning()
  return result[0].id
}

export async function createDrillSession(input: {
  count: number
  subject?: string
  source: 'all' | 'flagged' | 'missed'
}) {
  const pool = await getSelectablePool({ subject: input.subject, source: input.source })
  if (pool.length === 0) throw new Error('No questions match that selection.')
  const questionIds = selectDrill(pool, { count: input.count, seed: Date.now() })
  return createSession('drill', { questionIds, instantFeedback: true })
}

export async function createExamSession() {
  const pool = await getSelectablePool({ source: 'all' })
  if (pool.length === 0) throw new Error('No questions available for an exam.')
  const subjects = await listSubjects()
  const { ids, shortSubjects } = selectExam(pool, {
    seed: Date.now(),
    subjects: subjects.map((s) => s.name),
  })
  return createSession('exam', { questionIds: ids, instantFeedback: false, shortSubjects })
}

export async function recordAnswer(input: {
  sessionId: number
  questionId: number
  chosenKey: string
}) {
  const questionRows = await db.select().from(questions).where(eq(questions.id, input.questionId))
  const question = questionRows[0]
  if (!question) throw new Error(`Unknown question ${input.questionId}`)

  const isCorrect = question.correctKey === input.chosenKey
  const existingRows = await db
    .select()
    .from(attempts)
    .where(and(eq(attempts.sessionId, input.sessionId), eq(attempts.questionId, input.questionId)))
  const existing = existingRows[0]

  if (existing) {
    await db.update(attempts)
      .set({ chosenKey: input.chosenKey, isCorrect, answeredAt: Date.now() })
      .where(eq(attempts.id, existing.id))
  } else {
    await db.insert(attempts)
      .values({
        sessionId: input.sessionId,
        questionId: input.questionId,
        chosenKey: input.chosenKey,
        isCorrect,
        answeredAt: Date.now(),
      })
  }
  revalidatePath(`/test/${input.sessionId}`)
}

export async function finishSession(sessionId: number) {
  await db.update(sessions).set({ finishedAt: Date.now() }).where(eq(sessions.id, sessionId))
  revalidatePath(`/results/${sessionId}`)
}

export async function toggleFlag(questionId: number) {
  const existingRows = await db.select().from(questionMeta).where(eq(questionMeta.questionId, questionId))
  const existing = existingRows[0]
  const flagged = !(existing?.flagged ?? false)
  if (existing) {
    await db.update(questionMeta)
      .set({ flagged, updatedAt: Date.now() })
      .where(eq(questionMeta.questionId, questionId))
  } else {
    await db.insert(questionMeta).values({ questionId, flagged, note: null, updatedAt: Date.now() })
  }
  revalidatePath('/flagged')
  return flagged
}

export async function saveNote(questionId: number, note: string) {
  const existingRows = await db.select().from(questionMeta).where(eq(questionMeta.questionId, questionId))
  const existing = existingRows[0]
  if (existing) {
    await db.update(questionMeta)
      .set({ note, updatedAt: Date.now() })
      .where(eq(questionMeta.questionId, questionId))
  } else {
    await db.insert(questionMeta).values({ questionId, flagged: false, note, updatedAt: Date.now() })
  }
  revalidatePath(`/question/${questionId}`)
}

export async function saveExplanation(questionId: number, explanation: string) {
  // A blank submission clears the explanation rather than marking it user-edited,
  // so a future `npm run explain` + seed can still fill it in. Only a genuinely
  // non-blank save is treated as a protected, hand-written explanation.
  const isBlank = explanation.trim() === ''
  await db.update(questions)
    .set(
      isBlank
        ? { explanation: null, explanationEditedAt: null }
        : { explanation, explanationEditedAt: Date.now() },
    )
    .where(eq(questions.id, questionId))
  revalidatePath(`/question/${questionId}`)
}
