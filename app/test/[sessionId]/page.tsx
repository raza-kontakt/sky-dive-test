import { notFound } from 'next/navigation'
import { TestRunner } from '@/components/TestRunner'
import { getQuestions, getSession, getSessionAttempts } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default async function TestPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = Number(sessionId)
  const session = getSession(id)
  if (!session) notFound()

  const questions = getQuestions(session.config.questionIds)
  const initialAnswers = Object.fromEntries(
    getSessionAttempts(id)
      .filter((a) => a.chosenKey !== null)
      .map((a) => [a.questionId, a.chosenKey as string]),
  )

  return (
    <>
      {session.config.shortSubjects && session.config.shortSubjects.length > 0 && (
        <p className="mx-auto max-w-3xl px-6 pt-6 text-sm text-amber-700 dark:text-amber-500 sm:px-10">
          Short exam: {session.config.shortSubjects.join(', ')} have fewer questions than the exam
          format requires, so this exam has {questions.length} questions.
        </p>
      )}
      <TestRunner
        sessionId={id}
        questions={questions}
        instantFeedback={session.config.instantFeedback}
        initialAnswers={initialAnswers}
        startedAt={session.startedAt}
      />
    </>
  )
}
