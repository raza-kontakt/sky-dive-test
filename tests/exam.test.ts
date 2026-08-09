import { describe, expect, it } from 'vitest'
import { EXAM_SIZE, PER_CAT } from '../lib/constants'
import { score, selectDrill, selectExam, type Selectable } from '../lib/exam'

const SUBJECTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']

function pool(perSubject = 20): Selectable[] {
  const out: Selectable[] = []
  let id = 1
  for (const subject of SUBJECTS) {
    for (let i = 0; i < perSubject; i++) out.push({ id: id++, subject, attemptCount: 0 })
  }
  return out
}

describe('selectExam', () => {
  it('picks exactly PER_CAT questions from every subject with no duplicates', () => {
    const result = selectExam(pool(), { seed: 1 })
    expect(result.ids).toHaveLength(EXAM_SIZE)
    expect(new Set(result.ids).size).toBe(EXAM_SIZE)
    expect(result.shortSubjects).toEqual([])
    const byId = new Map(pool().map((q) => [q.id, q.subject]))
    for (const subject of SUBJECTS) {
      expect(result.ids.filter((id) => byId.get(id) === subject)).toHaveLength(PER_CAT)
    }
  })

  it('takes everything available and reports subjects with fewer than PER_CAT questions', () => {
    const thin = pool().filter((q) => q.subject !== 'C' || q.id % 20 < 5)
    const result = selectExam(thin, { seed: 1 })
    expect(result.shortSubjects).toEqual(['C'])
    expect(result.ids.length).toBeLessThan(EXAM_SIZE)
  })

  it('is reproducible for a given seed', () => {
    expect(selectExam(pool(), { seed: 42 }).ids).toEqual(selectExam(pool(), { seed: 42 }).ids)
  })

  it('reports missing subjects when a canonical subject list is supplied', () => {
    const poolWithoutG = pool().filter((q) => q.subject !== 'G')
    const result = selectExam(poolWithoutG, { seed: 1, subjects: SUBJECTS })
    expect(result.shortSubjects).toEqual(['G'])
    expect(result.ids.length).toBeLessThan(EXAM_SIZE)
    const byId = new Map(poolWithoutG.map((q) => [q.id, q.subject]))
    for (const subject of SUBJECTS) {
      const count = result.ids.filter((id) => byId.get(id) === subject).length
      if (subject === 'G') {
        expect(count).toBe(0)
      } else {
        expect(count).toBe(PER_CAT)
      }
    }
  })

  it('produces identical results when subjects list is complete and fully populated', () => {
    const fullPool = pool()
    const withoutSubjects = selectExam(fullPool, { seed: 42 })
    const withSubjects = selectExam(fullPool, { seed: 42, subjects: SUBJECTS })
    expect(withSubjects.ids).toEqual(withoutSubjects.ids)
    expect(withSubjects.shortSubjects).toEqual(withoutSubjects.shortSubjects)
  })

  it('reports thin subjects correctly when a canonical subject list is supplied', () => {
    const thin = pool().filter((q) => q.subject !== 'C' || q.id % 20 < 5)
    const result = selectExam(thin, { seed: 1, subjects: SUBJECTS })
    expect(result.shortSubjects).toEqual(['C'])
    expect(result.ids.length).toBeLessThan(EXAM_SIZE)
  })

  it('does not mutate the caller\'s subjects array', () => {
    const unsorted = ['G', 'F', 'E', 'D', 'C', 'B', 'A']
    const original = [...unsorted]
    selectExam(pool(), { seed: 1, subjects: unsorted })
    expect(unsorted).toEqual(original)
  })
})

describe('selectDrill', () => {
  it('returns the requested count with no duplicates', () => {
    const ids = selectDrill(pool(), { count: 20, seed: 1 })
    expect(ids).toHaveLength(20)
    expect(new Set(ids).size).toBe(20)
  })

  it('returns the whole pool when it is smaller than the requested count', () => {
    expect(selectDrill(pool(1), { count: 50, seed: 1 })).toHaveLength(7)
  })

  it('prefers least-attempted questions', () => {
    const seen: Selectable[] = [
      { id: 1, subject: 'A', attemptCount: 9 },
      { id: 2, subject: 'A', attemptCount: 0 },
      { id: 3, subject: 'A', attemptCount: 5 },
    ]
    expect(selectDrill(seen, { count: 1, seed: 1 })).toEqual([2])
  })
})

describe('score', () => {
  it('computes per-subject and overall percentages', () => {
    const result = score([
      { subject: 'A', isCorrect: true },
      { subject: 'A', isCorrect: true },
      { subject: 'A', isCorrect: true },
      { subject: 'A', isCorrect: false },
      { subject: 'B', isCorrect: true },
    ])
    expect(result.subjects.find((s) => s.subject === 'A')!.percent).toBe(75)
    expect(result.subjects.find((s) => s.subject === 'A')!.passed).toBe(true)
    expect(result.overallPercent).toBe(80)
  })

  it('fails the whole session when one subject is just under the threshold', () => {
    const attempts = [
      ...Array.from({ length: 14 }, () => ({ subject: 'A', isCorrect: true })),
      ...Array.from({ length: 10 }, () => ({ subject: 'B', isCorrect: true })),
      ...Array.from({ length: 4 }, () => ({ subject: 'B', isCorrect: false })),
    ]
    const result = score(attempts)
    expect(result.overallPercent).toBeGreaterThan(80)
    expect(result.subjects.find((s) => s.subject === 'B')!.percent).toBeCloseTo(71.43, 1)
    expect(result.passed).toBe(false)
  })

  it('passes when every subject is exactly at the threshold', () => {
    const attempts = [
      ...Array.from({ length: 3 }, () => ({ subject: 'A', isCorrect: true })),
      { subject: 'A', isCorrect: false },
    ]
    expect(score(attempts).passed).toBe(true)
  })

  it('treats an empty session as not passed', () => {
    expect(score([])).toEqual({ overallPercent: 0, subjects: [], passed: false })
  })
})
