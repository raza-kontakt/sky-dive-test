export const LETTERS = ['a', 'b', 'c', 'd'] as const
export type Letter = (typeof LETTERS)[number]

export type BankQuestion = {
  subject: string
  number: number
  stem: string
  options: { letter: Letter; text: string }[]
  correctKey: Letter
  imageKey: string | null
}

export type ParsedTrainer = {
  subjects: string[]
  questions: BankQuestion[]
  images: Record<string, string>
}

type RawQuestion = { c: string; n: number; s: string; o: string[]; k: string; g: string | null }

function slice(html: string, startMarker: string, endMarker: string, open: string, close: string) {
  const start = html.indexOf(startMarker)
  if (start === -1) throw new Error(`marker not found: ${startMarker}`)
  const end = html.indexOf(endMarker, start)
  if (end === -1) throw new Error(`marker not found after ${startMarker}: ${endMarker}`)
  const segment = html.slice(start, end)
  const from = segment.indexOf(open)
  const to = segment.lastIndexOf(close)
  if (from === -1 || to === -1) throw new Error(`could not bound ${startMarker}`)
  return segment.slice(from, to + 1)
}

export function parseTrainer(html: string): ParsedTrainer {
  const raw: RawQuestion[] = JSON.parse(slice(html, 'const DATA', 'const IMGS', '[', ']'))
  const images: Record<string, string> = JSON.parse(slice(html, 'const IMGS', 'const CATS', '{', '}'))
  const subjects: string[] = JSON.parse(slice(html, 'const CATS', 'const PASS', '[', ']'))

  const questions = raw.map((r, i) => {
    if (!subjects.includes(r.c)) throw new Error(`question ${i}: unknown subject ${r.c}`)
    if (r.o.length !== 4) throw new Error(`question ${r.c}#${r.n}: expected 4 options, got ${r.o.length}`)
    if (!LETTERS.includes(r.k as Letter)) throw new Error(`question ${r.c}#${r.n}: bad correct key ${r.k}`)
    if (r.g !== null && images[r.g] === undefined) throw new Error(`question ${r.c}#${r.n}: missing image ${r.g}`)
    return {
      subject: r.c,
      number: r.n,
      stem: r.s,
      options: r.o.map((text, idx) => ({ letter: LETTERS[idx], text })),
      correctKey: r.k as Letter,
      imageKey: r.g,
    }
  })

  return { subjects, questions, images }
}
