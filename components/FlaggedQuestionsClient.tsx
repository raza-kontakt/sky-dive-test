'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toggleFlag } from '@/lib/actions'
import type { QuestionView } from '@/lib/queries'

type Props = {
  questions: QuestionView[]
  subjectGroups: { subject: string; ids: number[]; count: number }[]
}

export function FlaggedQuestionsClient({ questions, subjectGroups }: Props) {
  const [pending, startTransition] = useTransition()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  const filteredQuestions =
    selectedCategory === 'all'
      ? questions
      : questions.filter((q) => q.subject === selectedCategory)

  function handleUnflag(questionId: number) {
    startTransition(async () => {
      await toggleFlag(questionId)
    })
  }

  // Group by subject for display
  const groupedBySubject = new Map<string, typeof questions>()
  for (const question of filteredQuestions) {
    if (!groupedBySubject.has(question.subject)) {
      groupedBySubject.set(question.subject, [])
    }
    groupedBySubject.get(question.subject)!.push(question)
  }

  return (
    <div className="mt-6 space-y-6">
      {subjectGroups.length > 1 && (
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Filter by category:
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="mt-2 rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
          >
            <option value="all">All categories ({questions.length})</option>
            {subjectGroups.map((group) => (
              <option key={group.subject} value={group.subject}>
                {group.subject} ({group.count})
              </option>
            ))}
          </select>
        </div>
      )}

      {filteredQuestions.length === 0 ? (
        <p className="text-neutral-600 dark:text-neutral-400">No flagged questions in this category.</p>
      ) : (
        Array.from(groupedBySubject.entries()).map(([subject, subjectQuestions]) => (
          <section key={subject}>
            <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100">
              {subject}
            </h2>
            <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
              {subjectQuestions.map((question) => (
                <li
                  key={question.id}
                  className="flex items-start justify-between gap-4 p-4 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                >
                  <Link
                    href={`/question/${question.id}`}
                    className="flex-1 hover:opacity-70"
                  >
                    <span className="text-xs uppercase tracking-wide text-neutral-500">
                      No {question.number}
                    </span>
                    <p className="mt-1 line-clamp-2">{question.stem}</p>
                  </Link>
                  <button
                    onClick={() => handleUnflag(question.id)}
                    disabled={pending}
                    className="mt-1 flex-shrink-0 rounded px-2.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-900/20"
                  >
                    Unflag
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
