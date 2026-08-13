import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db/client'
import { attempts, options, questionMeta, questions, sessions, subjects } from '@/db/schema'
import { score, type Selectable } from './exam'

export type SessionConfig = {
  questionIds: number[]
  instantFeedback: boolean
  shortSubjects?: string[]
}

export type QuestionView = {
  id: number
  subject: string
  number: number
  stem: string
  imagePath: string | null
  correctKey: string
  explanation: string | null
  flagged: boolean
  note: string | null
  options: { letter: string; text: string; whyWrong: string | null }[]
}

export async function listSubjects() {
  return await db
    .select({
      id: subjects.id,
      name: subjects.name,
      slug: subjects.slug,
      count: sql<number>`count(${questions.id})`,
    })
    .from(subjects)
    .leftJoin(questions, eq(questions.subjectId, subjects.id))
    .groupBy(subjects.id)
    .orderBy(subjects.name)
}

export async function getQuestions(ids: number[]): Promise<QuestionView[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select({
      id: questions.id,
      subject: subjects.name,
      number: questions.number,
      stem: questions.stem,
      imagePath: questions.imagePath,
      correctKey: questions.correctKey,
      explanation: questions.explanation,
      flagged: questionMeta.flagged,
      note: questionMeta.note,
    })
    .from(questions)
    .innerJoin(subjects, eq(subjects.id, questions.subjectId))
    .leftJoin(questionMeta, eq(questionMeta.questionId, questions.id))
    .where(inArray(questions.id, ids))

  const optionRows = await db.select().from(options).where(inArray(options.questionId, ids))

  const byId = new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        flagged: row.flagged ?? false,
        options: optionRows
          .filter((o) => o.questionId === row.id)
          .sort((a, b) => a.letter.localeCompare(b.letter))
          .map((o) => ({ letter: o.letter, text: o.text, whyWrong: o.whyWrong })),
      },
    ]),
  )
  // Preserve the caller's ordering — it is the session's question order.
  return ids.map((id) => byId.get(id)).filter((q): q is QuestionView => q !== undefined)
}

export async function getQuestion(id: number): Promise<QuestionView | null> {
  return (await getQuestions([id]))[0] ?? null
}

export async function getSelectablePool(opts: {
  subject?: string
  source: 'all' | 'flagged' | 'missed'
}): Promise<Selectable[]> {
  const rows = await db
    .select({
      id: questions.id,
      subject: subjects.name,
      attemptCount: sql<number>`count(${attempts.id})`,
      missedCount: sql<number>`sum(case when ${attempts.isCorrect} = false then 1 else 0 end)`,
      flagged: questionMeta.flagged,
    })
    .from(questions)
    .innerJoin(subjects, eq(subjects.id, questions.subjectId))
    .leftJoin(attempts, eq(attempts.questionId, questions.id))
    .leftJoin(questionMeta, eq(questionMeta.questionId, questions.id))
    .groupBy(questions.id, subjects.id, questionMeta.questionId)

  return rows
    .filter((row) => (opts.subject ? row.subject === opts.subject : true))
    .filter((row) => {
      if (opts.source === 'flagged') return row.flagged === true
      if (opts.source === 'missed') return (row.missedCount ?? 0) > 0
      return true
    })
    .map((row) => ({ id: row.id, subject: row.subject, attemptCount: row.attemptCount ?? 0 }))
}

export async function getSession(id: number) {
  const row = await db.select().from(sessions).where(eq(sessions.id, id))
  if (!row || row.length === 0) return null
  return { ...row[0], config: JSON.parse(row[0].configJson) as SessionConfig }
}

export async function getSessionAttempts(sessionId: number) {
  return await db
    .select({
      questionId: attempts.questionId,
      chosenKey: attempts.chosenKey,
      isCorrect: attempts.isCorrect,
      answeredAt: attempts.answeredAt,
    })
    .from(attempts)
    .where(eq(attempts.sessionId, sessionId))
}

export async function getOverallStats() {
  const all = await db.select({ isCorrect: attempts.isCorrect }).from(attempts)
  const lastExamRows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.mode, 'exam'), sql`${sessions.finishedAt} is not null`))
    .orderBy(sql`${sessions.finishedAt} desc`)
    .limit(1)
  const lastExam = lastExamRows[0] ?? null

  let lastExamPercent: number | null = null
  let lastExamPassed: boolean | null = null
  if (lastExam) {
    const config = JSON.parse(lastExam.configJson) as SessionConfig
    const examQuestions = await getQuestions(config.questionIds)
    const attempts_ = await getSessionAttempts(lastExam.id)
    const attemptsByQuestion = new Map(attempts_.map((a) => [a.questionId, a]))
    // Same score() the results page uses, so the two verdicts can never disagree —
    // an exam's real pass/fail is per-subject, not the overall percentage.
    const result = score(
      examQuestions.map((q) => ({
        subject: q.subject,
        isCorrect: attemptsByQuestion.get(q.id)?.isCorrect ?? false,
      })),
    )
    lastExamPercent = examQuestions.length ? result.overallPercent : null
    lastExamPassed = examQuestions.length ? result.passed : null
  }

  const flaggedResults = await db.select().from(questionMeta).where(eq(questionMeta.flagged, true))

  return {
    attempts: all.length,
    correct: all.filter((a) => a.isCorrect).length,
    lastExamPercent,
    lastExamPassed,
    flaggedCount: flaggedResults.length,
  }
}
