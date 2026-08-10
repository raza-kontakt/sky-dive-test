import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createDrillSession } from '@/lib/actions'
import { getQuestions, getSelectablePool } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default function FlaggedPage() {
  const ids = getSelectablePool({ source: 'flagged' }).map((entry) => entry.id)
  const rows = getQuestions(ids)

  async function drillFlagged() {
    'use server'
    const id = await createDrillSession({ count: ids.length, source: 'flagged' })
    redirect(`/test/${id}`)
  }

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Flagged ({rows.length})</h1>

      {rows.length > 0 && (
        <form action={drillFlagged} className="mt-4">
          <button className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white">
            Drill these
          </button>
        </form>
      )}

      <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map((question) => (
          <li key={question.id} className="py-3">
            <Link href={`/question/${question.id}`} className="block hover:opacity-70">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                {question.subject} · No {question.number}
              </span>
              <p className="mt-1">{question.stem}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
