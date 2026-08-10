import Link from 'next/link'
import { redirect } from 'next/navigation'
import { StartDrillForm } from '@/components/StartDrillForm'
import { EXAM_SIZE, PASS, PER_CAT } from '@/lib/constants'
import { createExamSession } from '@/lib/actions'
import { getOverallStats, listSubjects } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default function Home() {
  let subjects: ReturnType<typeof listSubjects>
  let stats: ReturnType<typeof getOverallStats>
  try {
    subjects = listSubjects()
    stats = getOverallStats()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('no such table')) throw error
    redirect('/setup')
  }
  if (subjects.length === 0) redirect('/setup')

  async function startExam() {
    'use server'
    const id = await createExamSession()
    redirect(`/test/${id}`)
  }

  const accuracy = stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : null

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <h1 className="text-3xl font-semibold tracking-tight">DFV Theory Trainer</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        {subjects.reduce((sum, s) => sum + s.count, 0)} questions across {subjects.length} subjects.
        Pass mark is {Math.round(PASS * 100)}% in every subject.
      </p>

      <div className="mt-6 flex flex-wrap gap-6 text-sm text-neutral-600 dark:text-neutral-400">
        <span>{stats.attempts} answers recorded</span>
        {accuracy !== null && <span>{accuracy}% overall accuracy</span>}
        {stats.lastExamPercent !== null && (
          <span>
            Last exam: {Math.round(stats.lastExamPercent)}% ({stats.lastExamPassed ? 'passed' : 'not a pass'})
          </span>
        )}
        <Link href="/flagged" className="text-blue-600 hover:underline">
          {stats.flaggedCount} flagged
        </Link>
      </div>

      <section className="mt-10 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="text-lg font-medium">Quick drill</h2>
        <p className="mb-4 mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Answers marked immediately, with the explanation.
        </p>
        <StartDrillForm subjects={subjects} />
      </section>

      <section className="mt-6 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="text-lg font-medium">Exam simulation</h2>
        <p className="mb-4 mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          The real format: {PER_CAT} questions from each of the {subjects.length} subjects,{' '}
          {EXAM_SIZE} in total. No feedback until the end.
        </p>
        <form action={startExam}>
          <button className="rounded-lg bg-neutral-900 px-5 py-2.5 font-medium text-white dark:bg-white dark:text-neutral-900">
            Start exam
          </button>
        </form>
      </section>

      <Link href="/browse" className="mt-6 inline-block text-blue-600 hover:underline">
        Browse all questions →
      </Link>
    </main>
  )
}
