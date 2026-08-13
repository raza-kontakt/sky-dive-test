import Link from 'next/link'
import { notFound } from 'next/navigation'
import { QuestionImage } from '@/components/QuestionImage'
import { PASS } from '@/lib/constants'
import { score } from '@/lib/exam'
import { getQuestions, getSession, getSessionAttempts } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default async function ResultsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = Number(sessionId)
  const session = await getSession(id)
  if (!session) notFound()

  const questions = await getQuestions(session.config.questionIds)
  const attempts = await getSessionAttempts(id)
  const attemptsByQuestion = new Map(attempts.map((a) => [a.questionId, a]))

  // An unanswered question counts as wrong.
  const result = score(
    questions.map((q) => ({
      subject: q.subject,
      isCorrect: attemptsByQuestion.get(q.id)?.isCorrect ?? false,
    })),
  )

  const isExam = session.mode === 'exam'
  const missed = questions.filter((q) => !(attemptsByQuestion.get(q.id)?.isCorrect ?? false))
  const failedSubjects = result.subjects.filter((s) => !s.passed).map((s) => s.subject)

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Home
      </Link>

      <h1 className="mt-4 text-3xl font-semibold">{Math.round(result.overallPercent)}%</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        {questions.length - missed.length} of {questions.length} correct
      </p>

      <div
        className={`mt-4 rounded-lg p-4 ${
          result.passed
            ? 'bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-200'
            : 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200'
        }`}
      >
        {isExam
          ? result.passed
            ? `Pass — ${Math.round(PASS * 100)}% or better in every subject.`
            : `Not a pass. You need ${Math.round(PASS * 100)}% in every subject — short in ${failedSubjects.join(', ')}.`
          : result.passed
            ? `Practice drill — above the ${Math.round(PASS * 100)}% threshold in every subject covered.`
            : `Practice drill — below the ${Math.round(PASS * 100)}% threshold in ${failedSubjects.join(', ')}.`}
      </div>

      <table className="mt-8 w-full text-sm">
        <thead className="border-b border-neutral-200 text-left dark:border-neutral-800">
          <tr>
            <th className="py-2">Subject</th>
            <th className="py-2 text-right">Correct</th>
            <th className="py-2 text-right">%</th>
            <th className="py-2 text-right">Verdict</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {result.subjects.map((s) => (
            <tr key={s.subject}>
              <td className="py-2">{s.subject}</td>
              <td className="py-2 text-right tabular-nums">
                {s.correct}/{s.total}
              </td>
              <td className="py-2 text-right tabular-nums">{Math.round(s.percent)}%</td>
              <td className={`py-2 text-right ${s.passed ? 'text-green-600' : 'text-red-600'}`}>
                {s.passed ? 'pass' : `below ${Math.round(PASS * 100)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-10 text-lg font-medium">
        {missed.length ? `Review — ${missed.length} missed` : 'Nothing missed'}
      </h2>
      <div className="mt-4 flex flex-col gap-6">
        {missed.map((question) => {
          const attempt = attemptsByQuestion.get(question.id)
          const chosen = question.options.find((o) => o.letter === attempt?.chosenKey)
          const correct = question.options.find((o) => o.letter === question.correctKey)!
          return (
            <div
              key={question.id}
              className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"
            >
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                {question.subject} · No {question.number}
              </p>
              <p className="mt-1 whitespace-pre-line">{question.stem}</p>
              <QuestionImage src={question.imagePath} />
              <p className="mt-3 text-sm text-red-700 dark:text-red-400">
                <b>Your answer:</b>{' '}
                {chosen ? `${chosen.letter.toUpperCase()}) ${chosen.text}` : 'not answered'}
              </p>
              {chosen?.whyWrong && (
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{chosen.whyWrong}</p>
              )}
              <p className="mt-2 text-sm text-green-700 dark:text-green-400">
                <b>Correct:</b> {correct.letter.toUpperCase()}) {correct.text}
              </p>
              <p className="mt-2 text-sm">
                {question.explanation || (
                  <span className="text-neutral-500">Explanation not generated.</span>
                )}
              </p>
              <Link
                href={`/question/${question.id}`}
                className="mt-3 inline-block text-sm text-blue-600 hover:underline"
              >
                Open question →
              </Link>
            </div>
          )
        })}
      </div>
    </main>
  )
}
