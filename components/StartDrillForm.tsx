'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createDrillSession } from '@/lib/actions'

export function StartDrillForm({ subjects }: { subjects: { name: string; count: number }[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [count, setCount] = useState(20)
  const [subject, setSubject] = useState('')
  const [source, setSource] = useState<'all' | 'flagged' | 'missed'>('all')
  const [error, setError] = useState<string | null>(null)

  function start() {
    setError(null)
    startTransition(async () => {
      try {
        const id = await createDrillSession({ count, subject: subject || undefined, source })
        router.push(`/test/${id}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start the drill.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: 'var(--line)',
            backgroundColor: 'var(--surface)',
            color: 'var(--text)',
          }}
        >
          {[5, 10, 20, 50, 100, 150].map((n) => (
            <option key={n} value={n}>
              {n} questions
            </option>
          ))}
        </select>
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: 'var(--line)',
            backgroundColor: 'var(--surface)',
            color: 'var(--text)',
          }}
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name} ({s.count})
            </option>
          ))}
        </select>
        <select
          value={source}
          onChange={(e) => setSource(e.target.value as 'all' | 'flagged' | 'missed')}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: 'var(--line)',
            backgroundColor: 'var(--surface)',
            color: 'var(--text)',
          }}
        >
          <option value="all">Whole bank</option>
          <option value="flagged">Flagged only</option>
          <option value="missed">Previously missed</option>
        </select>
      </div>
      <button
        onClick={start}
        disabled={pending}
        className="w-fit rounded-lg px-5 py-2.5 font-medium text-white disabled:opacity-50 transition-all"
        style={{
          backgroundColor: 'var(--blue)',
          cursor: pending ? 'not-allowed' : 'pointer',
        }}
        onMouseEnter={(e) => !pending && (e.currentTarget.style.backgroundColor = 'var(--blue-dark)')}
        onMouseLeave={(e) => !pending && (e.currentTarget.style.backgroundColor = 'var(--blue)')}
      >
        {pending ? 'Starting…' : 'Start drill'}
      </button>
      {error && <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
  )
}
