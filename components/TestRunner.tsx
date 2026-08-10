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
  const finishInFlight = useRef(false)

  const question = questions[index]

  // A failure on one question shouldn't keep glowing red while the user has moved on.
  // Adjusted during render (React's documented pattern for resetting state when a
  // prop/key changes) rather than in a useEffect, so it takes effect before paint.
  const [errorQuestionId, setErrorQuestionId] = useState(question?.id)
  if (errorQuestionId !== question?.id) {
    setErrorQuestionId(question?.id)
    setError(null)
  }

  if (!question) {
    return (
      <main className="mx-auto max-w-3xl p-6 sm:p-10">
        <p className="text-neutral-600 dark:text-neutral-400">This session has no questions.</p>
      </main>
    )
  }

  const chosen = answers[question.id]
  const revealed = instantFeedback && chosen !== undefined
  const answeredCount = Object.keys(answers).length

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
    if (finishInFlight.current) return
    finishInFlight.current = true
    startTransition(async () => {
      try {
        await finishSession(sessionId)
        router.push(`/results/${sessionId}`)
      } catch {
        setError('Your session could not be finished. Please try again.')
      } finally {
        finishInFlight.current = false
      }
    })
  }

  function optionClass(letter: string) {
    const base =
      'w-full rounded-lg border px-3 py-4 text-left transition-colors dark:border-neutral-700 border-neutral-300'
    if (!revealed) {
      return chosen === letter
        ? `${base} border-blue-600 bg-blue-50 dark:bg-blue-950 font-medium`
        : `${base} hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer`
    }
    if (letter === question.correctKey) return `${base} border-green-600 bg-green-50 dark:bg-green-950 font-medium`
    if (letter === chosen) return `${base} border-red-600 bg-red-50 dark:bg-red-950 font-medium`
    return `${base} opacity-60`
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-10">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
        <span>
          Q{index + 1}/{questions.length} · {answeredCount} answered
        </span>
        <span className="flex items-center gap-4">
          {!instantFeedback && <ElapsedTimer startedAt={startedAt} />}
          <button onClick={flip} className="hover:underline whitespace-nowrap">
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

      <p className="mt-4 sm:mt-6 text-xs uppercase tracking-wide text-neutral-500">
        {question.subject} · Q{question.number}
      </p>
      <h1 className="mt-2 whitespace-pre-line text-lg sm:text-xl font-semibold">{question.stem}</h1>
      <QuestionImage src={question.imagePath} />

      <div className="mt-6 flex flex-col gap-2">
        {question.options.map((option) => (
          <button
            key={option.letter}
            onClick={() => choose(option.letter)}
            className={optionClass(option.letter)}
            disabled={revealed}
            type="button"
          >
            <span className="font-semibold uppercase text-sm">{option.letter}.</span>
            <span className="ml-3 text-sm sm:text-base">{option.text}</span>
          </button>
        ))}
      </div>

      {revealed && (
        <div className="mt-6 rounded-lg border border-neutral-200 p-3 sm:p-4 dark:border-neutral-800 bg-white dark:bg-neutral-900/50">
          <p className={`font-semibold text-sm sm:text-base ${chosen === question.correctKey ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
            {chosen === question.correctKey ? '✓ Correct!' : `✗ Wrong — answer is ${question.correctKey.toUpperCase()}`}
          </p>
          {chosen !== question.correctKey && (
            <p className="mt-2 text-xs sm:text-sm text-neutral-600 dark:text-neutral-400">
              {question.options.find((o) => o.letter === chosen)?.whyWrong ||
                'No explanation generated.'}
            </p>
          )}
          <p className="mt-3 text-xs sm:text-sm text-neutral-700 dark:text-neutral-300">
            {question.explanation || 'No explanation generated.'}
          </p>
        </div>
      )}

      <div className="mt-6 sm:mt-8 flex items-center justify-between gap-2">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="rounded-lg border border-neutral-300 px-3 sm:px-4 py-2 text-sm sm:text-base disabled:opacity-40 dark:border-neutral-700 transition-colors"
          type="button"
        >
          ← Prev
        </button>
        {index === questions.length - 1 ? (
          <button
            onClick={finish}
            className="rounded-lg bg-blue-600 px-4 sm:px-5 py-2 sm:py-2.5 font-medium text-white text-sm sm:text-base hover:bg-blue-700 transition-colors"
            type="button"
          >
            Finish
          </button>
        ) : (
          <button
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            className="rounded-lg border border-neutral-300 px-3 sm:px-4 py-2 text-sm sm:text-base dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors"
            type="button"
          >
            Next →
          </button>
        )}
      </div>

      <div className="mt-6 sm:mt-8 grid grid-cols-8 sm:grid-cols-10 gap-1 sm:gap-2">
        {questions.map((q, i) => {
          const isAnswered = answers[q.id] !== undefined
          const isCorrect = isAnswered && answers[q.id] === q.correctKey
          const isIncorrect = isAnswered && answers[q.id] !== q.correctKey

          return (
            <button
              key={q.id}
              onClick={() => setIndex(i)}
              className={`aspect-square rounded text-xs font-medium transition ${
                i === index
                  ? 'bg-blue-600 text-white'
                  : isCorrect
                    ? 'bg-green-600 text-white'
                    : isIncorrect
                      ? 'bg-red-600 text-white'
                      : 'border border-neutral-300 dark:border-neutral-700'
              }`}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </main>
  )
}
