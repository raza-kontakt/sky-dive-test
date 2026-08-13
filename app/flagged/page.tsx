import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createDrillSession } from '@/lib/actions'
import { getQuestions, getSelectablePool, listSubjects } from '@/lib/queries'
import { FlaggedQuestionsClient } from '@/components/FlaggedQuestionsClient'

export const dynamic = 'force-dynamic'

export default async function FlaggedPage() {
  const allFlaggedPool = await getSelectablePool({ source: 'flagged' })
  const subjects = await listSubjects()

  // Group flagged questions by subject
  const bySubject = new Map<string, typeof allFlaggedPool>()
  for (const item of allFlaggedPool) {
    if (!bySubject.has(item.subject)) {
      bySubject.set(item.subject, [])
    }
    bySubject.get(item.subject)!.push(item)
  }

  const subjectGroups = Array.from(bySubject.entries()).map(([subject, items]) => ({
    subject,
    ids: items.map((i) => i.id),
    count: items.length,
  }))

  const rows = await getQuestions(allFlaggedPool.map((entry) => entry.id))

  async function drillFlagged() {
    'use server'
    const id = await createDrillSession({ count: allFlaggedPool.length, source: 'flagged' })
    redirect(`/test/${id}`)
  }

  async function drillBySubject(subject: string) {
    'use server'
    const pool = await getSelectablePool({ source: 'flagged', subject })
    const ids = pool.map((entry) => entry.id)
    const id = await createDrillSession({ count: ids.length, source: 'flagged' })
    redirect(`/test/${id}`)
  }

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Flagged Questions ({rows.length})</h1>

      {rows.length > 0 && (
        <div className="mt-6 space-y-4">
          <form action={drillFlagged}>
            <button className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white hover:bg-blue-700">
              Practice All Flagged
            </button>
          </form>

          {subjectGroups.length > 1 && (
            <div>
              <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Practice by category:
              </p>
              <div className="flex flex-wrap gap-2">
                {subjectGroups.map((group) => (
                  <form key={group.subject} action={drillBySubject.bind(null, group.subject)}>
                    <button className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800">
                      {group.subject} ({group.count})
                    </button>
                  </form>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <FlaggedQuestionsClient questions={rows} subjectGroups={subjectGroups} />
    </main>
  )
}
