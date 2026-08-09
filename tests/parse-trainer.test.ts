import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LETTERS, parseTrainer } from '../scripts/lib/parse-trainer'

const html = readFileSync('data/source/DFV_Theory_Trainer.html', 'utf8')
const parsed = parseTrainer(html)

const EXPECTED_COUNTS: Record<string, number> = {
  'Behaviour in Special Circumstances': 103,
  Freefall: 96,
  Equipment: 90,
  Aerodynamics: 82,
  'Air Traffic Law': 57,
  Meteorology: 50,
  'Human Performance': 35,
}

describe('parseTrainer', () => {
  it('extracts all 513 questions', () => {
    expect(parsed.questions).toHaveLength(513)
  })

  it('extracts the seven subjects with the expected counts', () => {
    expect(parsed.subjects).toHaveLength(7)
    for (const [subject, count] of Object.entries(EXPECTED_COUNTS)) {
      expect(parsed.subjects).toContain(subject)
      expect(parsed.questions.filter((q) => q.subject === subject)).toHaveLength(count)
    }
  })

  it('extracts 15 images, all of them PNG data URIs', () => {
    const keys = Object.keys(parsed.images)
    expect(keys).toHaveLength(15)
    for (const key of keys) {
      expect(parsed.images[key].startsWith('data:image/png;base64,')).toBe(true)
    }
  })

  it('resolves every image reference', () => {
    const referenced = parsed.questions.map((q) => q.imageKey).filter((k): k is string => k !== null)
    expect(referenced).toHaveLength(15)
    for (const key of referenced) {
      expect(parsed.images[key]).toBeDefined()
    }
  })

  it('gives every question four lettered options and a valid correct key', () => {
    for (const q of parsed.questions) {
      expect(q.options).toHaveLength(4)
      expect(q.options.map((o) => o.letter)).toEqual([...LETTERS])
      expect(LETTERS).toContain(q.correctKey)
      expect(q.stem.length).toBeGreaterThan(0)
    }
  })

  it('parses a known question correctly', () => {
    const q = parsed.questions.find((x) => x.subject === 'Aerodynamics' && x.number === 7)!
    expect(q.imageKey).toBe('ae_007')
    expect(q.correctKey).toBe('b')
    expect(q.options[1].text).toBe('buoyancy.')
  })
})
