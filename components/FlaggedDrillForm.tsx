'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createDrillSession } from '@/lib/actions'

type Subject = {
  id: number
  name: string
  slug: string
  count: number
}

type Props = {
  subjects: Subject[]
  flaggedBySubject: Map<string, number>
  totalFlagged: number
}

export function FlaggedDrillForm({ subjects, flaggedBySubject, totalFlagged }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [error, setError] = useState<string | null>(null)

  if (totalFlagged === 0) {
    return (
      <div className="rounded-lg border border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400">
        No flagged questions yet. Flag questions while practicing to use this feature.
      </div>
    )
  }

  function startDrill(category: string = 'all') {
    setError(null)
    startTransition(async () => {
      try {
        const id = await createDrillSession({
          count: category === 'all' ? totalFlagged : (flaggedBySubject.get(category) || 0),
          subject: category === 'all' ? undefined : category,
          source: 'flagged',
        })
        router.push(`/test/${id}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start the drill.')
      }
    })
  }

  const displayedCategories = Array.from(flaggedBySubject.entries())
    .filter(([_, count]) => count > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))

  return (
    <div className="flex flex-col gap-4">
      <div>
        <button
          onClick={() => startDrill('all')}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white disabled:opacity-50 hover:bg-blue-700"
        >
          {pending ? 'Starting…' : `Practice All Flagged (${totalFlagged})`}
        </button>
      </div>

      {displayedCategories.length > 0 && (
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Or practice by category:
          </label>
          <div className="flex flex-wrap gap-2">
            {displayedCategories.map(([category, count]) => (
              <button
                key={category}
                onClick={() => startDrill(category)}
                disabled={pending}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 disabled:opacity-50 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                {category} ({count})
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
