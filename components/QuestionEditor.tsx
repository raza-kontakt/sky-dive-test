'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
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
  const [error, setError] = useState<string | null>(null)
  const savedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Same shape as TestRunner's in-flight guards: a click while a save for that
  // field is already pending is ignored, and the guard is always cleared in
  // `finally` so a failure can never wedge the control.
  const inFlightRef = useRef<Set<'explanation' | 'note' | 'flag'>>(new Set())

  useEffect(() => {
    return () => {
      if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    }
  }, [])

  function showSaved(what: 'explanation' | 'note') {
    setSaved(what)
    if (savedTimeoutRef.current) clearTimeout(savedTimeoutRef.current)
    savedTimeoutRef.current = setTimeout(() => setSaved(null), 2000)
  }

  function persist(what: 'explanation' | 'note') {
    if (inFlightRef.current.has(what)) return
    inFlightRef.current.add(what)
    startTransition(async () => {
      try {
        if (what === 'explanation') await saveExplanation(questionId, explanation)
        else await saveNote(questionId, note)
        setError(null)
        showSaved(what)
      } catch {
        setError(
          what === 'explanation'
            ? 'Your explanation could not be saved. Please try again.'
            : 'Your note could not be saved. Please try again.',
        )
      } finally {
        inFlightRef.current.delete(what)
      }
    })
  }

  function flip() {
    if (inFlightRef.current.has('flag')) return
    inFlightRef.current.add('flag')
    startTransition(async () => {
      try {
        setFlagged(await toggleFlag(questionId))
        setError(null)
      } catch {
        setError('Your flag could not be saved. Please try again.')
      } finally {
        inFlightRef.current.delete('flag')
      }
    })
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <button
        onClick={flip}
        className="w-fit rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700"
      >
        {flagged ? '★ Flagged' : '☆ Flag this question'}
      </button>

      {error && <p className="text-sm text-red-600 dark:text-red-500">{error}</p>}

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
