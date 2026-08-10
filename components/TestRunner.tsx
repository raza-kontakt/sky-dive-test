'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { QuestionImage } from '@/components/QuestionImage'
import { finishSession, recordAnswer, toggleFlag } from '@/lib/actions'
import type { QuestionView } from '@/lib/queries'

type Props = {
  sessionId: number
  questions: QuestionView[]
  instantFeedback: boolean
  initialAnswers: Record<number, string>
  startedAt: number
}

/** Counts up from the session's start time. Shown in exam mode only. */
function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const handle = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(handle)
  }, [])
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  return <span className="tabular-nums">{`${mm}:${ss}`}</span>
}

export function TestRunner({
  sessionId,
  questions,
  instantFeedback,
  initialAnswers,
  startedAt,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>(initialAnswers)
  const [flags, setFlags] = useState<Record<number, boolean>>(
    Object.fromEntries(questions.map((q) => [q.id, q.flagged])),
  )
  const [error, setError] = useState<string | null>(null)
  const answersInFlight = useRef<Set<number>>(new Set())
  const flagsInFlight = useRef<Set<number>>(new Set())

  const question = questions[index]
  const chosen = answers[question.id]
  const revealed = instantFeedback && chosen !== undefined
  const answeredCount = Object.keys(answers).length

  // A failure on one question shouldn't keep glowing red while the user has moved on.
  // Adjusted during render (React's documented pattern for resetting state when a
  // prop/key changes) rather than in a useEffect, so it takes effect before paint.
  const [errorQuestionId, setErrorQuestionId] = useState(question.id)
  if (errorQuestionId !== question.id) {
    setErrorQuestionId(question.id)
    setError(null)
  }

  function choose(letter: string) {
    if (revealed) return
    const questionId = question.id
    if (answersInFlight.current.has(questionId)) return
    const previous = answers[questionId]
    setAnswers((prev) => ({ ...prev, [questionId]: letter }))
    answersInFlight.current.add(questionId)
    startTransition(async () => {
      try {
        await recordAnswer({ sessionId, questionId, chosenKey: letter })
        setError(null)
      } catch {
        setAnswers((prev) => {
          // A later call already superseded this one — leave its result alone.
          if (prev[questionId] !== letter) return prev
          if (previous === undefined) {
            const next = { ...prev }
            delete next[questionId]
            return next
          }
          return { ...prev, [questionId]: previous }
        })
        setError('Your answer could not be saved. Please try again.')
      } finally {
        answersInFlight.current.delete(questionId)
      }
    })
  }

  function flip() {
    const questionId = question.id
    if (flagsInFlight.current.has(questionId)) return
    const previous = flags[questionId]
    const next = !previous
    setFlags((prev) => ({ ...prev, [questionId]: next }))
    flagsInFlight.current.add(questionId)
    startTransition(async () => {
      try {
        await toggleFlag(questionId)
        setError(null)
      } catch {
        setFlags((prev) => {
          // A later call already superseded this one — leave its result alone.
          if (prev[questionId] !== next) return prev
          return { ...prev, [questionId]: previous }
        })
        setError('Your flag could not be saved. Please try again.')
      } finally {
        flagsInFlight.current.delete(questionId)
      }
    })
  }

  function finish() {
    startTransition(async () => {
      await finishSession(sessionId)
      router.push(`/results/${sessionId}`)
    })
  }

  function optionClass(letter: string) {
    const base =
      'w-full rounded-lg border px-4 py-3 text-left transition dark:border-neutral-700 border-neutral-300'
    if (!revealed) {
      return chosen === letter
        ? `${base} border-blue-600 bg-blue-50 dark:bg-blue-950`
        : `${base} hover:border-blue-400`
    }
    if (letter === question.correctKey) return `${base} border-green-600 bg-green-50 dark:bg-green-950`
    if (letter === chosen) return `${base} border-red-600 bg-red-50 dark:bg-red-950`
    return `${base} opacity-60`
  }

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <div className="flex items-center justify-between text-sm text-neutral-600 dark:text-neutral-400">
        <span>
          Question {index + 1} of {questions.length} · {answeredCount} answered
        </span>
        <span className="flex items-center gap-4">
          {!instantFeedback && <ElapsedTimer startedAt={startedAt} />}
          <button onClick={flip} className="hover:underline">
            {flags[question.id] ? '★ Flagged' : '☆ Flag'}
          </button>
        </span>
      </div>

      <div className="mt-2 h-1 w-full rounded bg-neutral-200 dark:bg-neutral-800">
        <div
          className="h-1 rounded bg-blue-600 transition-all"
          style={{ width: `${(answeredCount / questions.length) * 100}%` }}
        />
      </div>

      {error && <p className="mt-4 text-sm text-red-600 dark:text-red-500">{error}</p>}

      <p className="mt-6 text-xs uppercase tracking-wide text-neutral-500">
        {question.subject} · No {question.number}
      </p>
      <h1 className="mt-1 whitespace-pre-line text-xl">{question.stem}</h1>
      <QuestionImage src={question.imagePath} />

      <div className="mt-6 flex flex-col gap-3">
        {question.options.map((option) => (
          <button key={option.letter} onClick={() => choose(option.letter)} className={optionClass(option.letter)}>
            <span className="mr-2 font-medium uppercase">{option.letter})</span>
            {option.text}
          </button>
        ))}
      </div>

      {revealed && (
        <div className="mt-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
          <p className="font-medium">
            {chosen === question.correctKey ? 'Correct.' : `Wrong — the answer is ${question.correctKey.toUpperCase()}.`}
          </p>
          {chosen !== question.correctKey && (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              {question.options.find((o) => o.letter === chosen)?.whyWrong ??
                'No note generated for this option.'}
            </p>
          )}
          <p className="mt-3 text-sm">
            {question.explanation ?? 'Explanation not generated for this question.'}
          </p>
        </div>
      )}

      <div className="mt-8 flex items-center justify-between">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="rounded-lg border border-neutral-300 px-4 py-2 disabled:opacity-40 dark:border-neutral-700"
        >
          Previous
        </button>
        {index === questions.length - 1 ? (
          <button onClick={finish} className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white">
            Finish
          </button>
        ) : (
          <button
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            className="rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700"
          >
            Next
          </button>
        )}
      </div>

      <div className="mt-8 grid grid-cols-10 gap-2">
        {questions.map((q, i) => (
          <button
            key={q.id}
            onClick={() => setIndex(i)}
            className={`aspect-square rounded text-xs ${
              i === index
                ? 'bg-blue-600 text-white'
                : answers[q.id] !== undefined
                  ? 'bg-neutral-300 dark:bg-neutral-700'
                  : 'border border-neutral-300 dark:border-neutral-700'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </main>
  )
}
