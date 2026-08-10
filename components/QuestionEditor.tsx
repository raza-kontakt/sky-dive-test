'use client'

import { useState, useTransition } from 'react'
import { saveExplanation, saveNote, toggleFlag } from '@/lib/actions'

type Props = {
  questionId: number
  initialExplanation: string
  initialNote: string
  initialFlagged: boolean
}

export function QuestionEditor({
  questionId,
  initialExplanation,
  initialNote,
  initialFlagged,
}: Props) {
  const [, startTransition] = useTransition()
  const [explanation, setExplanation] = useState(initialExplanation)
  const [note, setNote] = useState(initialNote)
  const [flagged, setFlagged] = useState(initialFlagged)
  const [saved, setSaved] = useState<string | null>(null)

  function persist(what: 'explanation' | 'note') {
    startTransition(async () => {
      if (what === 'explanation') await saveExplanation(questionId, explanation)
      else await saveNote(questionId, note)
      setSaved(what)
      setTimeout(() => setSaved(null), 2000)
    })
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <button
        onClick={() =>
          startTransition(async () => {
            setFlagged(await toggleFlag(questionId))
          })
        }
        className="w-fit rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700"
      >
        {flagged ? '★ Flagged' : '☆ Flag this question'}
      </button>

      <label className="flex flex-col gap-2">
        <span className="font-medium">Explanation</span>
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={6}
          className="rounded-lg border border-neutral-300 p-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          onClick={() => persist('explanation')}
          className="w-fit rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          {saved === 'explanation' ? 'Saved' : 'Save explanation'}
        </button>
      </label>

      <label className="flex flex-col gap-2">
        <span className="font-medium">My note</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className="rounded-lg border border-neutral-300 p-3 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          onClick={() => persist('note')}
          className="w-fit rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          {saved === 'note' ? 'Saved' : 'Save note'}
        </button>
      </label>
    </div>
  )
}
