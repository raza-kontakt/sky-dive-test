import { PASS, PER_CAT } from './constants'

export type Selectable = { id: number; subject: string; attemptCount: number }

/** Deterministic PRNG so a seed reproduces a selection exactly. */
function rng(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return ((state >>> 0) % 1_000_000) / 1_000_000
  }
}

/** Sorts least-attempted first, breaking ties with the seeded PRNG. */
function weightedShuffle(items: Selectable[], next: () => number) {
  return items
    .map((item) => ({ item, key: item.attemptCount + next() }))
    .sort((a, b) => a.key - b.key)
    .map((entry) => entry.item)
}

export function selectDrill(pool: Selectable[], opts: { count: number; seed: number }): number[] {
  const next = rng(opts.seed)
  return weightedShuffle(pool, next)
    .slice(0, opts.count)
    .map((q) => q.id)
}

export function selectExam(
  pool: Selectable[],
  opts: { seed: number; subjects?: string[] },
): { ids: number[]; shortSubjects: string[] } {
  const next = rng(opts.seed)
  const bySubject = new Map<string, Selectable[]>()
  for (const q of pool) {
    const list = bySubject.get(q.subject) ?? []
    list.push(q)
    bySubject.set(q.subject, list)
  }

  // Determine the universe of subjects: use provided list or derive from pool
  const subjectsList = opts.subjects !== undefined ? opts.subjects.sort() : [...bySubject.keys()].sort()

  const ids: number[] = []
  const shortSubjects: string[] = []
  for (const subject of subjectsList) {
    const available = bySubject.get(subject) ?? []
    if (available.length < PER_CAT) shortSubjects.push(subject)
    for (const q of weightedShuffle(available, next).slice(0, PER_CAT)) ids.push(q.id)
  }
  return { ids, shortSubjects }
}

export type ScoredAttempt = { subject: string; isCorrect: boolean }
export type SubjectScore = {
  subject: string
  correct: number
  total: number
  percent: number
  passed: boolean
}
export type Score = { overallPercent: number; subjects: SubjectScore[]; passed: boolean }

export function score(attempts: ScoredAttempt[]): Score {
  if (attempts.length === 0) return { overallPercent: 0, subjects: [], passed: false }

  const tally = new Map<string, { correct: number; total: number }>()
  for (const attempt of attempts) {
    const entry = tally.get(attempt.subject) ?? { correct: 0, total: 0 }
    entry.total += 1
    if (attempt.isCorrect) entry.correct += 1
    tally.set(attempt.subject, entry)
  }

  const subjects: SubjectScore[] = [...tally.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subject, { correct, total }]) => ({
      subject,
      correct,
      total,
      percent: (correct / total) * 100,
      passed: correct / total >= PASS,
    }))

  const correct = attempts.filter((a) => a.isCorrect).length
  return {
    overallPercent: (correct / attempts.length) * 100,
    subjects,
    passed: subjects.every((s) => s.passed),
  }
}
