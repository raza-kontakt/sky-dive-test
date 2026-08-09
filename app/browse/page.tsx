import Link from 'next/link'
import { getSelectablePool, getQuestions, listSubjects } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; q?: string }>
}) {
  const { subject, q } = await searchParams
  const subjects = listSubjects()
  const ids = getSelectablePool({ subject, source: 'all' }).map((entry) => entry.id)
  const needle = (q ?? '').toLowerCase()
  const rows = getQuestions(ids).filter(
    (question) => needle === '' || question.stem.toLowerCase().includes(needle),
  )

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Browse ({rows.length})</h1>

      <form className="mt-4 flex flex-wrap gap-3">
        <select
          name="subject"
          defaultValue={subject ?? ''}
          className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search question text"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button className="rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700">
          Search
        </button>
      </form>

      <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map((question) => (
          <li key={question.id} className="py-3">
            <Link href={`/question/${question.id}`} className="block hover:opacity-70">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                {question.subject} · No {question.number}
                {question.flagged && ' · flagged'}
              </span>
              <p className="mt-1">{question.stem}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
