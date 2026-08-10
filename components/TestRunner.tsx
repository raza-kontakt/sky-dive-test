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

  function optionStyle(letter: string): React.CSSProperties {
    const baseStyle: React.CSSProperties = {
      width: '100%',
      borderRadius: '8px',
      padding: '12px 16px',
      textAlign: 'left',
      border: `1px solid var(--line)`,
      backgroundColor: 'var(--surface)',
      color: 'var(--text)',
      cursor: revealed ? 'default' : 'pointer',
      fontSize: '16px',
      fontWeight: '500',
    }

    if (!revealed) {
      if (chosen === letter) {
        return {
          ...baseStyle,
          borderColor: 'var(--blue)',
          backgroundColor: 'rgba(59, 142, 232, 0.08)',
          fontWeight: '600',
        }
      }
      return baseStyle
    }

    if (letter === question.correctKey) {
      return {
        ...baseStyle,
        borderColor: 'var(--green)',
        backgroundColor: 'rgba(18, 178, 122, 0.08)',
        fontWeight: '600',
      }
    }

    if (letter === chosen) {
      return {
        ...baseStyle,
        borderColor: 'var(--error)',
        backgroundColor: 'rgba(255, 90, 60, 0.08)',
        fontWeight: '600',
      }
    }

    return { ...baseStyle, opacity: 0.5 }
  }

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6 lg:p-10" style={{ backgroundColor: 'var(--background)', color: 'var(--text)' }}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs sm:text-sm" style={{ color: 'var(--muted)' }}>
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

      <div className="mt-2 h-1 w-full rounded" style={{ backgroundColor: 'var(--line)' }}>
        <div
          className="h-1 rounded transition-all"
          style={{
            width: `${(answeredCount / questions.length) * 100}%`,
            backgroundColor: 'var(--blue)',
          }}
        />
      </div>

      {error && <p className="mt-4 text-sm" style={{ color: 'var(--error)' }}>{error}</p>}

      <p className="mt-4 sm:mt-6 text-xs uppercase tracking-wide" style={{ color: 'var(--muted)' }}>
        {question.subject} · Q{question.number}
      </p>
      <h1 className="mt-2 whitespace-pre-line text-lg sm:text-xl font-semibold" style={{ color: 'var(--text)' }}>{question.stem}</h1>
      <QuestionImage src={question.imagePath} />

      <div className="mt-6 flex flex-col gap-2">
        {question.options.map((option) => (
          <button
            key={option.letter}
            onClick={() => choose(option.letter)}
            style={optionStyle(option.letter)}
            disabled={revealed}
            type="button"
          >
            <span className="font-semibold uppercase text-sm">{option.letter}.</span>
            <span className="ml-3 text-sm sm:text-base">{option.text}</span>
          </button>
        ))}
      </div>

      {revealed && (
        <div
          className="mt-6 rounded-lg border p-3 sm:p-4"
          style={{
            borderColor: 'var(--line)',
            backgroundColor: 'var(--surface)',
            borderLeft: `4px solid ${chosen === question.correctKey ? 'var(--green)' : 'var(--error)'}`,
          }}
        >
          <p
            className="font-semibold text-sm sm:text-base"
            style={{ color: chosen === question.correctKey ? 'var(--green)' : 'var(--error)' }}
          >
            {chosen === question.correctKey ? '✓ Correct!' : `✗ Wrong — answer is ${question.correctKey.toUpperCase()}`}
          </p>
          {chosen !== question.correctKey && (
            <p className="mt-2 text-xs sm:text-sm" style={{ color: 'var(--muted)' }}>
              {question.options.find((o) => o.letter === chosen)?.whyWrong ||
                'No explanation generated.'}
            </p>
          )}
          <p className="mt-3 text-xs sm:text-sm" style={{ color: 'var(--text)' }}>
            {question.explanation || 'No explanation generated.'}
          </p>
        </div>
      )}

      <div className="mt-6 sm:mt-8 flex items-center justify-between gap-2">
        <button
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
          className="rounded-lg px-3 sm:px-4 py-2 text-sm sm:text-base disabled:opacity-40 transition-colors font-medium"
          style={{
            border: `1px solid var(--line)`,
            backgroundColor: 'var(--surface)',
            color: 'var(--text)',
            cursor: index === 0 ? 'default' : 'pointer',
          }}
          type="button"
        >
          ← Prev
        </button>
        {index === questions.length - 1 ? (
          <button
            onClick={finish}
            className="rounded-lg px-4 sm:px-5 py-2 sm:py-2.5 font-medium text-white text-sm sm:text-base transition-colors"
            style={{
              backgroundColor: 'var(--blue)',
              cursor: 'pointer',
            }}
            type="button"
          >
            Finish
          </button>
        ) : (
          <button
            onClick={() => setIndex((i) => Math.min(questions.length - 1, i + 1))}
            className="rounded-lg px-3 sm:px-4 py-2 text-sm sm:text-base transition-colors font-medium"
            style={{
              border: `1px solid var(--line)`,
              backgroundColor: 'var(--surface)',
              color: 'var(--text)',
              cursor: 'pointer',
            }}
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

          let backgroundColor = 'var(--surface)'
          let borderColor = 'var(--line)'
          let textColor = 'var(--text)'

          if (i === index) {
            backgroundColor = 'var(--blue)'
            textColor = '#fff'
            borderColor = 'var(--blue)'
          } else if (isCorrect) {
            backgroundColor = 'var(--green)'
            textColor = '#fff'
            borderColor = 'var(--green)'
          } else if (isIncorrect) {
            backgroundColor = 'var(--error)'
            textColor = '#fff'
            borderColor = 'var(--error)'
          }

          return (
            <button
              key={q.id}
              onClick={() => setIndex(i)}
              className="aspect-square rounded text-xs font-medium transition"
              style={{
                backgroundColor,
                color: textColor,
                border: `1px solid ${borderColor}`,
                cursor: 'pointer',
              }}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
    </main>
  )
}
