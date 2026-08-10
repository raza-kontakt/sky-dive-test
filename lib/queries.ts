import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { attempts, options, questionMeta, questions, sessions, subjects } from '@/db/schema'
import { score, type Selectable } from './exam'

const db = getDb()

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

export function listSubjects() {
  return db
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
    .all()
}

export function getQuestions(ids: number[]): QuestionView[] {
  if (ids.length === 0) return []
  const rows = db
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
    .all()

  const optionRows = db.select().from(options).where(inArray(options.questionId, ids)).all()

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

export function getQuestion(id: number): QuestionView | null {
  return getQuestions([id])[0] ?? null
}

export function getSelectablePool(opts: {
  subject?: string
  source: 'all' | 'flagged' | 'missed'
}): Selectable[] {
  const rows = db
    .select({
      id: questions.id,
      subject: subjects.name,
      attemptCount: sql<number>`count(${attempts.id})`,
      missedCount: sql<number>`sum(case when ${attempts.isCorrect} = 0 then 1 else 0 end)`,
      flagged: questionMeta.flagged,
    })
    .from(questions)
    .innerJoin(subjects, eq(subjects.id, questions.subjectId))
    .leftJoin(attempts, eq(attempts.questionId, questions.id))
    .leftJoin(questionMeta, eq(questionMeta.questionId, questions.id))
    .groupBy(questions.id)
    .all()

  return rows
    .filter((row) => (opts.subject ? row.subject === opts.subject : true))
    .filter((row) => {
      if (opts.source === 'flagged') return row.flagged === true
      if (opts.source === 'missed') return (row.missedCount ?? 0) > 0
      return true
    })
    .map((row) => ({ id: row.id, subject: row.subject, attemptCount: row.attemptCount ?? 0 }))
}

export function getSession(id: number) {
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get()
  if (!row) return null
  return { ...row, config: JSON.parse(row.configJson) as SessionConfig }
}

export function getSessionAttempts(sessionId: number) {
  return db
    .select({
      questionId: attempts.questionId,
      chosenKey: attempts.chosenKey,
      isCorrect: attempts.isCorrect,
      answeredAt: attempts.answeredAt,
    })
    .from(attempts)
    .where(eq(attempts.sessionId, sessionId))
    .all()
}

export function getOverallStats() {
  const all = db.select({ isCorrect: attempts.isCorrect }).from(attempts).all()
  const lastExam = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.mode, 'exam'), sql`${sessions.finishedAt} is not null`))
    .orderBy(sql`${sessions.finishedAt} desc`)
    .limit(1)
    .get()

  let lastExamPercent: number | null = null
  let lastExamPassed: boolean | null = null
  if (lastExam) {
    const config = JSON.parse(lastExam.configJson) as SessionConfig
    const examQuestions = getQuestions(config.questionIds)
    const attemptsByQuestion = new Map(getSessionAttempts(lastExam.id).map((a) => [a.questionId, a]))
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

  const flaggedCount = db.select().from(questionMeta).where(eq(questionMeta.flagged, true)).all().length

  return {
    attempts: all.length,
    correct: all.filter((a) => a.isCorrect).length,
    lastExamPercent,
    lastExamPassed,
    flaggedCount,
  }
}
