# DFV Theory Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Next.js + SQLite app for practising the DFV skydiving theory exam, with the full 513-question bank, AI-generated explanations, flags, notes, quick drills, and the real 98-question exam simulation.

**Architecture:** Three one-time Node scripts feed a SQLite database: `extract.ts` parses the existing single-file HTML trainer into `data/bank.json` plus PNG files, `explain.ts` batch-calls the Claude API to write an explanation and per-distractor reasons for every question, and `seed.ts` upserts both into `data/app.db`. The Next.js app then only reads the bank and writes user data (attempts, flags, notes). Domain logic — question selection and scoring — lives in pure functions so it can be unit-tested without a database.

**Tech Stack:** Next.js 15 (app router, TypeScript) · SQLite via `better-sqlite3` + Drizzle ORM · Tailwind CSS · `@anthropic-ai/sdk` + Zod for explanation generation · vitest · `tsx` for running scripts.

## Global Constraints

- Project root: `/Users/aliraza/rmpose/sky_dive/dfv-trainer/`. It is already a git repo containing `docs/` and `.gitignore`.
- Exam rules live in exactly one module (`lib/constants.ts`): `PASS = 0.75`, `PER_CAT = 14`, `SUBJECT_COUNT = 7`.
- Option letters are always lowercase `'a' | 'b' | 'c' | 'd'`, in that order.
- The seed script must never write to `question_meta`, `sessions`, or `attempts`, and must never overwrite a `questions.explanation` whose `explanation_edited_at` is non-null.
- All Claude API calls use model `claude-opus-5`.
- Scripts are run with `npx tsx <path>`; npm scripts wrap them.
- Tests are vitest, run with `npm test`. Node environment (no jsdom).

---

### Task 1: Project scaffold and bank extraction

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `app/` (via `create-next-app`)
- Create: `data/source/DFV_Theory_Trainer.html` (copied from `~/Downloads`)
- Create: `scripts/lib/parse-trainer.ts`
- Create: `scripts/extract.ts`
- Create: `vitest.config.ts`
- Test: `tests/parse-trainer.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces:
  - `LETTERS: readonly ['a','b','c','d']` and `type Letter = 'a'|'b'|'c'|'d'` from `scripts/lib/parse-trainer.ts`
  - `type BankQuestion = { subject: string; number: number; stem: string; options: { letter: Letter; text: string }[]; correctKey: Letter; imageKey: string | null }`
  - `type ParsedTrainer = { subjects: string[]; questions: BankQuestion[]; images: Record<string, string> }` — `images` maps an image key (`"ae_007"`) to its full data URI
  - `parseTrainer(html: string): ParsedTrainer`
  - Running `scripts/extract.ts` writes `data/bank.json` (shape `{ subjects: string[]; questions: BankQuestion[] }`) and `public/q/<imageKey>.png`

- [ ] **Step 1: Scaffold the Next.js app**

Run from the project root (`dfv-trainer/`). The `.` target keeps the existing `docs/` and `.gitignore`.

```bash
cd /Users/aliraza/rmpose/sky_dive/dfv-trainer && npx create-next-app@latest . --typescript --tailwind --eslint --app --no-src-dir --turbopack --import-alias "@/*" --yes
```

- [ ] **Step 2: Install runtime and dev dependencies**

```bash
cd /Users/aliraza/rmpose/sky_dive/dfv-trainer && npm install drizzle-orm better-sqlite3 @anthropic-ai/sdk zod && npm install -D drizzle-kit tsx vitest @types/better-sqlite3
```

- [ ] **Step 3: Copy the source HTML into the repo**

The parser tests run against the real file, so it must live in the repo rather than in `~/Downloads`.

```bash
mkdir -p /Users/aliraza/rmpose/sky_dive/dfv-trainer/data/source && cp "/Users/aliraza/Downloads/DFV_Theory_Trainer.html" /Users/aliraza/rmpose/sky_dive/dfv-trainer/data/source/DFV_Theory_Trainer.html
```

- [ ] **Step 4: Add the vitest config and the test script**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

Add to the `"scripts"` block of `package.json`:

```json
"test": "vitest run",
"extract": "tsx scripts/extract.ts"
```

- [ ] **Step 5: Write the failing parser test**

Create `tests/parse-trainer.test.ts`:

```typescript
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
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `../scripts/lib/parse-trainer`.

- [ ] **Step 7: Write the parser**

Create `scripts/lib/parse-trainer.ts`. The source HTML declares `const DATA = [...];` immediately followed by `const IMGS = {...};` and then `const CATS = [...];`, so each blob can be sliced by its neighbouring marker.

```typescript
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
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 6 tests.

- [ ] **Step 9: Write the extract CLI**

Create `scripts/extract.ts`. It writes nothing until parsing has fully succeeded, so a failure leaves any existing `bank.json` intact.

```typescript
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseTrainer } from './lib/parse-trainer'

const SOURCE = 'data/source/DFV_Theory_Trainer.html'
const IMAGE_DIR = 'public/q'

const parsed = parseTrainer(readFileSync(SOURCE, 'utf8'))

mkdirSync('data', { recursive: true })
mkdirSync(IMAGE_DIR, { recursive: true })

for (const [key, dataUri] of Object.entries(parsed.images)) {
  const base64 = dataUri.slice(dataUri.indexOf(',') + 1)
  writeFileSync(`${IMAGE_DIR}/${key}.png`, Buffer.from(base64, 'base64'))
}

writeFileSync(
  'data/bank.json',
  JSON.stringify({ subjects: parsed.subjects, questions: parsed.questions }, null, 2),
)

console.log(
  `wrote data/bank.json (${parsed.questions.length} questions, ${parsed.subjects.length} subjects) ` +
    `and ${Object.keys(parsed.images).length} images to ${IMAGE_DIR}/`,
)
```

- [ ] **Step 10: Run the extractor and confirm its output**

Run: `npm run extract && ls public/q | wc -l`
Expected: the log line reports 513 questions, 7 subjects, 15 images; `ls` prints `15`.

- [ ] **Step 11: Commit**

```bash
cd /Users/aliraza/rmpose/sky_dive/dfv-trainer && git add -A && git commit -m "feat: scaffold app and extract question bank from HTML trainer"
```

---

### Task 2: Database schema and idempotent seed

**Files:**
- Create: `db/schema.ts`
- Create: `db/client.ts`
- Create: `drizzle.config.ts`
- Create: `scripts/seed.ts`
- Test: `tests/seed.test.ts`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Consumes: `data/bank.json` from Task 1
- Produces:
  - Drizzle tables from `db/schema.ts`: `subjects`, `questions`, `options`, `questionMeta`, `sessions`, `attempts`
  - `getDb(file?: string)` from `db/client.ts` — returns a Drizzle instance bound to `better-sqlite3`; defaults to `data/app.db`
  - `seed(db, opts: { bankPath: string; explanationsPath?: string }): Promise<void>` from `scripts/seed.ts`

- [ ] **Step 1: Write the schema**

Create `db/schema.ts`:

```typescript
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const subjects = sqliteTable('subjects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
})

export const questions = sqliteTable(
  'questions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    subjectId: integer('subject_id')
      .notNull()
      .references(() => subjects.id),
    number: integer('number').notNull(),
    stem: text('stem').notNull(),
    imagePath: text('image_path'),
    correctKey: text('correct_key').notNull(),
    explanation: text('explanation'),
    explanationEditedAt: integer('explanation_edited_at'),
  },
  (t) => [uniqueIndex('questions_subject_number').on(t.subjectId, t.number)],
)

export const options = sqliteTable(
  'options',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    questionId: integer('question_id')
      .notNull()
      .references(() => questions.id),
    letter: text('letter').notNull(),
    text: text('text').notNull(),
    whyWrong: text('why_wrong'),
  },
  (t) => [uniqueIndex('options_question_letter').on(t.questionId, t.letter)],
)

export const questionMeta = sqliteTable('question_meta', {
  questionId: integer('question_id')
    .primaryKey()
    .references(() => questions.id),
  flagged: integer('flagged', { mode: 'boolean' }).notNull().default(false),
  note: text('note'),
  updatedAt: integer('updated_at').notNull(),
})

export const sessions = sqliteTable('sessions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  mode: text('mode').notNull(),
  configJson: text('config_json').notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
})

export const attempts = sqliteTable(
  'attempts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id),
    questionId: integer('question_id')
      .notNull()
      .references(() => questions.id),
    chosenKey: text('chosen_key'),
    isCorrect: integer('is_correct', { mode: 'boolean' }).notNull().default(false),
    answeredAt: integer('answered_at'),
  },
  (t) => [uniqueIndex('attempts_session_question').on(t.sessionId, t.questionId)],
)
```

- [ ] **Step 2: Write the database client and drizzle config**

Create `db/client.ts`:

```typescript
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'

export const DEFAULT_DB_FILE = 'data/app.db'

export function getDb(file: string = DEFAULT_DB_FILE) {
  const sqlite = new Database(file)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  return drizzle({ client: sqlite, schema })
}

export type Db = ReturnType<typeof getDb>
```

Create `drizzle.config.ts`:

```typescript
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: 'data/app.db' },
})
```

Add to the `"scripts"` block of `package.json`:

```json
"db:generate": "drizzle-kit generate",
"db:migrate": "drizzle-kit migrate",
"seed": "tsx scripts/seed.ts"
```

Append to `.gitignore`:

```
data/app.db
data/app.db-*
public/q/
```

- [ ] **Step 3: Generate the migration**

Run: `npm run db:generate`
Expected: a new `drizzle/0000_*.sql` file creating all six tables.

- [ ] **Step 4: Write the failing seed test**

Create `tests/seed.test.ts`. It seeds an on-disk temp database twice and asserts user data survives.

```typescript
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq } from 'drizzle-orm'
import { afterAll, describe, expect, it } from 'vitest'
import { getDb } from '../db/client'
import { attempts, options, questionMeta, questions, sessions, subjects } from '../db/schema'
import { seed } from '../scripts/seed'

const dir = mkdtempSync(join(tmpdir(), 'dfv-seed-'))
const file = join(dir, 'test.db')
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('seed', () => {
  it('loads the full bank, preserves user data, and is idempotent', async () => {
    const db = getDb(file)

    await seed(db, { bankPath: 'data/bank.json' })
    expect(db.select().from(questions).all()).toHaveLength(513)
    expect(db.select().from(subjects).all()).toHaveLength(7)
    expect(db.select().from(options).all()).toHaveLength(513 * 4)
    expect(db.select().from(questions).all().filter((q) => q.imagePath !== null)).toHaveLength(15)

    // Simulate user activity and an edited explanation.
    const first = db.select().from(questions).all()[0]
    db.insert(questionMeta)
      .values({ questionId: first.id, flagged: true, note: 'my note', updatedAt: 1 })
      .run()
    db.update(questions)
      .set({ explanation: 'hand written', explanationEditedAt: 1 })
      .where(eq(questions.id, first.id))
      .run()
    const session = db
      .insert(sessions)
      .values({ mode: 'drill', configJson: '{}', startedAt: 1 })
      .returning()
      .get()
    db.insert(attempts)
      .values({ sessionId: session.id, questionId: first.id, chosenKey: 'a', isCorrect: true, answeredAt: 1 })
      .run()

    await seed(db, { bankPath: 'data/bank.json' })

    expect(db.select().from(questions).all()).toHaveLength(513)
    expect(db.select().from(options).all()).toHaveLength(513 * 4)
    expect(db.select().from(questionMeta).all()).toHaveLength(1)
    expect(db.select().from(questionMeta).all()[0].note).toBe('my note')
    expect(db.select().from(attempts).all()).toHaveLength(1)
    const reloaded = db.select().from(questions).where(eq(questions.id, first.id)).get()!
    expect(reloaded.explanation).toBe('hand written')
  })
})
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test -- tests/seed.test.ts`
Expected: FAIL — cannot find module `../scripts/seed`.

- [ ] **Step 6: Write the seed script**

Create `scripts/seed.ts`:

```typescript
import { existsSync, readFileSync } from 'node:fs'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import { getDb, type Db } from '../db/client'
import { options, questions, subjects } from '../db/schema'
import type { BankQuestion } from './lib/parse-trainer'

type Bank = { subjects: string[]; questions: BankQuestion[] }

export type ExplanationRecord = {
  subject: string
  number: number
  explanation: string
  whyWrong: { letter: string; text: string }[]
}

export function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function seed(db: Db, opts: { bankPath: string; explanationsPath?: string }) {
  migrate(db, { migrationsFolder: 'drizzle' })

  const bank: Bank = JSON.parse(readFileSync(opts.bankPath, 'utf8'))

  const explanations = new Map<string, ExplanationRecord>()
  if (opts.explanationsPath && existsSync(opts.explanationsPath)) {
    const parsed: { records: ExplanationRecord[] } = JSON.parse(readFileSync(opts.explanationsPath, 'utf8'))
    for (const record of parsed.records) explanations.set(`${record.subject}#${record.number}`, record)
  }

  const subjectIds = new Map<string, number>()
  for (const name of bank.subjects) {
    const existing = db.select().from(subjects).where(eq(subjects.name, name)).get()
    if (existing) {
      subjectIds.set(name, existing.id)
      continue
    }
    const inserted = db.insert(subjects).values({ name, slug: slugify(name) }).returning().get()
    subjectIds.set(name, inserted.id)
  }

  for (const q of bank.questions) {
    const subjectId = subjectIds.get(q.subject)!
    const explanation = explanations.get(`${q.subject}#${q.number}`)
    const imagePath = q.imageKey ? `/q/${q.imageKey}.png` : null

    const existing = db
      .select()
      .from(questions)
      .where(eq(questions.subjectId, subjectId))
      .all()
      .find((row) => row.number === q.number)

    let questionId: number
    if (existing) {
      questionId = existing.id
      // Never clobber an explanation the user has edited.
      const nextExplanation =
        existing.explanationEditedAt !== null ? existing.explanation : (explanation?.explanation ?? existing.explanation)
      db.update(questions)
        .set({ stem: q.stem, imagePath, correctKey: q.correctKey, explanation: nextExplanation })
        .where(eq(questions.id, questionId))
        .run()
    } else {
      questionId = db
        .insert(questions)
        .values({
          subjectId,
          number: q.number,
          stem: q.stem,
          imagePath,
          correctKey: q.correctKey,
          explanation: explanation?.explanation ?? null,
          explanationEditedAt: null,
        })
        .returning()
        .get().id
    }

    const existingOptions = db.select().from(options).where(eq(options.questionId, questionId)).all()
    for (const opt of q.options) {
      const whyWrong =
        opt.letter === q.correctKey
          ? null
          : (explanation?.whyWrong.find((w) => w.letter === opt.letter)?.text ?? null)
      const row = existingOptions.find((o) => o.letter === opt.letter)
      if (row) {
        db.update(options)
          .set({ text: opt.text, whyWrong: whyWrong ?? row.whyWrong })
          .where(eq(options.id, row.id))
          .run()
      } else {
        db.insert(options).values({ questionId, letter: opt.letter, text: opt.text, whyWrong }).run()
      }
    }
  }
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seed(getDb(), { bankPath: 'data/bank.json', explanationsPath: 'data/explanations.json' })
    .then(() => console.log('seeded data/app.db'))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npm test -- tests/seed.test.ts`
Expected: PASS.

- [ ] **Step 8: Seed the real database**

Run: `npm run seed`
Expected: `seeded data/app.db`.

- [ ] **Step 9: Commit**

```bash
cd /Users/aliraza/rmpose/sky_dive/dfv-trainer && git add -A && git commit -m "feat: add SQLite schema and idempotent seed script"
```

---

### Task 3: Explanation generation script

**Files:**
- Create: `scripts/explain.ts`
- Modify: `package.json` (scripts), `.gitignore`

**Interfaces:**
- Consumes: `data/bank.json` and `public/q/*.png` from Task 1; `ExplanationRecord` from `scripts/seed.ts`
- Produces: `data/explanations.json`, shape `{ records: ExplanationRecord[] }`, consumed by `seed()`

This task has no unit test — it is a one-shot script whose only real behaviour is the network call. Its correctness is verified by running it and inspecting the output.

- [ ] **Step 1: Write the script**

Create `scripts/explain.ts`. It reads any existing output first and skips questions already done, so an interrupted run resumes. It writes after every batch, so a crash loses at most one batch.

```typescript
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { BankQuestion } from './lib/parse-trainer'
import type { ExplanationRecord } from './seed'

const BANK_PATH = 'data/bank.json'
const OUT_PATH = 'data/explanations.json'
const CONCURRENCY = 5

const ExplanationSchema = z.object({
  explanation: z
    .string()
    .describe('Why the correct answer is correct, in the terms a student sitting the exam needs. 2-4 sentences.'),
  whyWrong: z
    .array(
      z.object({
        letter: z.string().describe('The option letter: a, b, c or d.'),
        text: z.string().describe('One sentence on what this option confuses or misstates.'),
      }),
    )
    .describe('One entry for each incorrect option. Do not include the correct option.'),
})

const SYSTEM = `You are a German skydiving (DFV) theory instructor writing study notes for a student preparing for the AFF licence theory exam.
For each question you are given the stem, the four options, and which option is correct.
Explain why the correct answer is correct, then say for each wrong option what it confuses or misstates.
Be concrete and technical — use the actual physics, regulations, equipment behaviour or physiology involved. Do not restate the option text back as the explanation.
Keep it brief: a student is reading this immediately after getting the question wrong.`

const client = new Anthropic()
const bank: { questions: BankQuestion[] } = JSON.parse(readFileSync(BANK_PATH, 'utf8'))

const existing: ExplanationRecord[] = existsSync(OUT_PATH)
  ? JSON.parse(readFileSync(OUT_PATH, 'utf8')).records
  : []
const done = new Set(existing.map((r) => `${r.subject}#${r.number}`))
const records = [...existing]

const pending = bank.questions.filter((q) => !done.has(`${q.subject}#${q.number}`))
console.log(`${records.length} already generated, ${pending.length} to go`)

function buildContent(q: BankQuestion): Anthropic.MessageParam['content'] {
  const text = [
    `Subject: ${q.subject}`,
    `Question ${q.number}: ${q.stem}`,
    ...q.options.map((o) => `${o.letter}) ${o.text}`),
    `Correct answer: ${q.correctKey}`,
  ].join('\n')

  if (!q.imageKey) return text

  const png = readFileSync(`public/q/${q.imageKey}.png`).toString('base64')
  return [
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } },
    { type: 'text', text },
  ]
}

async function explain(q: BankQuestion): Promise<ExplanationRecord | null> {
  try {
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildContent(q) }],
      output_config: { format: zodOutputFormat(ExplanationSchema) },
    })
    const parsed = response.parsed_output
    if (!parsed) throw new Error(`no parsed output (stop_reason: ${response.stop_reason})`)
    return { subject: q.subject, number: q.number, ...parsed }
  } catch (error) {
    console.error(`failed ${q.subject}#${q.number}:`, error instanceof Error ? error.message : error)
    return null
  }
}

for (let i = 0; i < pending.length; i += CONCURRENCY) {
  const batch = pending.slice(i, i + CONCURRENCY)
  const results = await Promise.all(batch.map(explain))
  for (const result of results) if (result) records.push(result)
  writeFileSync(OUT_PATH, JSON.stringify({ records }, null, 2))
  console.log(`${records.length}/${bank.questions.length}`)
}

console.log(`wrote ${OUT_PATH} — ${records.length} of ${bank.questions.length} questions have explanations`)
```

- [ ] **Step 2: Add the npm script**

Add to the `"scripts"` block of `package.json`:

```json
"explain": "tsx scripts/explain.ts"
```

Append to `.gitignore`:

```
data/explanations.json
```

- [ ] **Step 3: Smoke-test on a handful of questions**

Temporarily cap the workload by adding `.slice(0, 6)` to the `pending` assignment, then run. Two of the six should include an image if you pick a slice that spans one — otherwise also run against `ff_062` manually.

Run: `npm run explain`
Expected: progress lines, then `data/explanations.json` containing 6 records. Open the file and check that the explanations are technically correct and that each has exactly 3 `whyWrong` entries with letters matching the wrong options.

- [ ] **Step 4: Remove the cap and run the full batch**

Delete the `.slice(0, 6)`, then:

Run: `npm run explain`
Expected: it skips the 6 already done, then works through the remaining ~507. Takes roughly 20 minutes. Re-run once at the end — it should report `0 to go` unless some questions failed, in which case the re-run retries exactly those.

- [ ] **Step 5: Re-seed so the explanations reach the database**

Run: `npm run seed`
Expected: `seeded data/app.db`.

- [ ] **Step 6: Commit**

```bash
cd /Users/aliraza/rmpose/sky_dive/dfv-trainer && git add -A && git commit -m "feat: add batch explanation generation via Claude API"
```

---

### Task 4: Exam constants, question selection, and scoring

**Files:**
- Create: `lib/constants.ts`
- Create: `lib/exam.ts`
- Test: `tests/exam.test.ts`

**Interfaces:**
- Consumes: `Letter` from `scripts/lib/parse-trainer.ts`
- Produces (all from `lib/exam.ts` unless noted):
  - `PASS = 0.75`, `PER_CAT = 14`, `SUBJECT_COUNT = 7` from `lib/constants.ts`
  - `type Selectable = { id: number; subject: string; attemptCount: number }`
  - `selectDrill(pool: Selectable[], opts: { count: number; seed: number }): number[]`
  - `selectExam(pool: Selectable[], opts: { seed: number }): { ids: number[]; shortSubjects: string[] }`
  - `type ScoredAttempt = { subject: string; isCorrect: boolean }`
  - `type SubjectScore = { subject: string; correct: number; total: number; percent: number; passed: boolean }`
  - `type Score = { overallPercent: number; subjects: SubjectScore[]; passed: boolean }`
  - `score(attempts: ScoredAttempt[]): Score`

- [ ] **Step 1: Write the constants**

Create `lib/constants.ts`:

```typescript
/** Fraction of questions that must be correct, per subject, to pass the exam. */
export const PASS = 0.75
/** Questions drawn from each subject in an exam simulation. */
export const PER_CAT = 14
/** Number of subjects in the DFV bank. */
export const SUBJECT_COUNT = 7
/** Total questions in an exam simulation. */
export const EXAM_SIZE = PER_CAT * SUBJECT_COUNT
```

- [ ] **Step 2: Write the failing selection and scoring tests**

Create `tests/exam.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test -- tests/exam.test.ts`
Expected: FAIL — cannot find module `../lib/exam`.

- [ ] **Step 4: Write the selection and scoring module**

Create `lib/exam.ts`. Unanswered questions are handled by the caller, which passes `isCorrect: false` for them.

```typescript
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
  opts: { seed: number },
): { ids: number[]; shortSubjects: string[] } {
  const next = rng(opts.seed)
  const bySubject = new Map<string, Selectable[]>()
  for (const q of pool) {
    const list = bySubject.get(q.subject) ?? []
    list.push(q)
    bySubject.set(q.subject, list)
  }

  const ids: number[] = []
  const shortSubjects: string[] = []
  for (const subject of [...bySubject.keys()].sort()) {
    const available = bySubject.get(subject)!
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all tests across all three files.

- [ ] **Step 6: Commit**

```bash
cd /Users/aliraza/rmpose/sky_dive/dfv-trainer && git add -A && git commit -m "feat: add exam constants, question selection and scoring"
```

---

### Task 5: Data access layer

**Files:**
- Create: `lib/queries.ts`
- Create: `lib/actions.ts`

**Interfaces:**
- Consumes: `db/client.ts`, `db/schema.ts` from Task 2; `lib/exam.ts` from Task 4
- Produces (from `lib/queries.ts`):
  - `type QuestionView = { id: number; subject: string; number: number; stem: string; imagePath: string | null; correctKey: string; explanation: string | null; flagged: boolean; note: string | null; options: { letter: string; text: string; whyWrong: string | null }[] }`
  - `listSubjects(): { id: number; name: string; slug: string; count: number }[]`
  - `getQuestion(id: number): QuestionView | null`
  - `getQuestions(ids: number[]): QuestionView[]`
  - `getSelectablePool(opts: { subject?: string; source: 'all' | 'flagged' | 'missed' }): Selectable[]`
  - `getSession(id: number): { id: number; mode: string; config: SessionConfig; startedAt: number; finishedAt: number | null } | null`
  - `getSessionAttempts(sessionId: number): { questionId: number; chosenKey: string | null; isCorrect: boolean; answeredAt: number | null }[]`
  - `getOverallStats(): { attempts: number; correct: number; lastExamPercent: number | null; flaggedCount: number }`
  - `type SessionConfig = { questionIds: number[]; instantFeedback: boolean; shortSubjects?: string[] }`
- Produces (from `lib/actions.ts`, all `'use server'`):
  - `createDrillSession(input: { count: number; subject?: string; source: 'all' | 'flagged' | 'missed' }): Promise<number>`
  - `createExamSession(): Promise<number>`
  - `recordAnswer(input: { sessionId: number; questionId: number; chosenKey: string }): Promise<void>`
  - `finishSession(sessionId: number): Promise<void>`
  - `toggleFlag(questionId: number): Promise<boolean>`
  - `saveNote(questionId: number, note: string): Promise<void>`
  - `saveExplanation(questionId: number, explanation: string): Promise<void>`

- [ ] **Step 1: Write the query module**

Create `lib/queries.ts`:

```typescript
import { and, eq, inArray, sql } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { attempts, options, questionMeta, questions, sessions, subjects } from '@/db/schema'
import type { Selectable } from './exam'

const db = getDb()

export type SessionConfig = {
  questionIds: number[]
  instantFeedback: boolean
  shortSubjects?: string[]
}

export type QuestionView = {
  id: number
  subject: string
  number: number
  stem: string
  imagePath: string | null
  correctKey: string
  explanation: string | null
  flagged: boolean
  note: string | null
  options: { letter: string; text: string; whyWrong: string | null }[]
}

export function listSubjects() {
  return db
    .select({
      id: subjects.id,
      name: subjects.name,
      slug: subjects.slug,
      count: sql<number>`count(${questions.id})`,
    })
    .from(subjects)
    .leftJoin(questions, eq(questions.subjectId, subjects.id))
    .groupBy(subjects.id)
    .orderBy(subjects.name)
    .all()
}

export function getQuestions(ids: number[]): QuestionView[] {
  if (ids.length === 0) return []
  const rows = db
    .select({
      id: questions.id,
      subject: subjects.name,
      number: questions.number,
      stem: questions.stem,
      imagePath: questions.imagePath,
      correctKey: questions.correctKey,
      explanation: questions.explanation,
      flagged: questionMeta.flagged,
      note: questionMeta.note,
    })
    .from(questions)
    .innerJoin(subjects, eq(subjects.id, questions.subjectId))
    .leftJoin(questionMeta, eq(questionMeta.questionId, questions.id))
    .where(inArray(questions.id, ids))
    .all()

  const optionRows = db.select().from(options).where(inArray(options.questionId, ids)).all()

  const byId = new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        flagged: row.flagged ?? false,
        options: optionRows
          .filter((o) => o.questionId === row.id)
          .sort((a, b) => a.letter.localeCompare(b.letter))
          .map((o) => ({ letter: o.letter, text: o.text, whyWrong: o.whyWrong })),
      },
    ]),
  )
  // Preserve the caller's ordering — it is the session's question order.
  return ids.map((id) => byId.get(id)).filter((q): q is QuestionView => q !== undefined)
}

export function getQuestion(id: number): QuestionView | null {
  return getQuestions([id])[0] ?? null
}

export function getSelectablePool(opts: {
  subject?: string
  source: 'all' | 'flagged' | 'missed'
}): Selectable[] {
  const rows = db
    .select({
      id: questions.id,
      subject: subjects.name,
      attemptCount: sql<number>`count(${attempts.id})`,
      missedCount: sql<number>`sum(case when ${attempts.isCorrect} = 0 then 1 else 0 end)`,
      flagged: questionMeta.flagged,
    })
    .from(questions)
    .innerJoin(subjects, eq(subjects.id, questions.subjectId))
    .leftJoin(attempts, eq(attempts.questionId, questions.id))
    .leftJoin(questionMeta, eq(questionMeta.questionId, questions.id))
    .groupBy(questions.id)
    .all()

  return rows
    .filter((row) => (opts.subject ? row.subject === opts.subject : true))
    .filter((row) => {
      if (opts.source === 'flagged') return row.flagged === true
      if (opts.source === 'missed') return (row.missedCount ?? 0) > 0
      return true
    })
    .map((row) => ({ id: row.id, subject: row.subject, attemptCount: row.attemptCount ?? 0 }))
}

export function getSession(id: number) {
  const row = db.select().from(sessions).where(eq(sessions.id, id)).get()
  if (!row) return null
  return { ...row, config: JSON.parse(row.configJson) as SessionConfig }
}

export function getSessionAttempts(sessionId: number) {
  return db
    .select({
      questionId: attempts.questionId,
      chosenKey: attempts.chosenKey,
      isCorrect: attempts.isCorrect,
      answeredAt: attempts.answeredAt,
    })
    .from(attempts)
    .where(eq(attempts.sessionId, sessionId))
    .all()
}

export function getOverallStats() {
  const all = db.select({ isCorrect: attempts.isCorrect }).from(attempts).all()
  const lastExam = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.mode, 'exam'), sql`${sessions.finishedAt} is not null`))
    .orderBy(sql`${sessions.finishedAt} desc`)
    .limit(1)
    .get()

  let lastExamPercent: number | null = null
  if (lastExam) {
    const examAttempts = getSessionAttempts(lastExam.id)
    const config = JSON.parse(lastExam.configJson) as SessionConfig
    const correct = examAttempts.filter((a) => a.isCorrect).length
    lastExamPercent = config.questionIds.length
      ? (correct / config.questionIds.length) * 100
      : null
  }

  const flaggedCount = db.select().from(questionMeta).where(eq(questionMeta.flagged, true)).all().length

  return {
    attempts: all.length,
    correct: all.filter((a) => a.isCorrect).length,
    lastExamPercent,
    flaggedCount,
  }
}
```

- [ ] **Step 2: Write the server actions**

Create `lib/actions.ts`:

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/db/client'
import { attempts, questionMeta, questions, sessions } from '@/db/schema'
import { selectDrill, selectExam } from './exam'
import { getSelectablePool, type SessionConfig } from './queries'

const db = getDb()

function createSession(mode: string, config: SessionConfig) {
  return db
    .insert(sessions)
    .values({ mode, configJson: JSON.stringify(config), startedAt: Date.now() })
    .returning()
    .get().id
}

export async function createDrillSession(input: {
  count: number
  subject?: string
  source: 'all' | 'flagged' | 'missed'
}) {
  const pool = getSelectablePool({ subject: input.subject, source: input.source })
  if (pool.length === 0) throw new Error('No questions match that selection.')
  const questionIds = selectDrill(pool, { count: input.count, seed: Date.now() })
  return createSession('drill', { questionIds, instantFeedback: true })
}

export async function createExamSession() {
  const pool = getSelectablePool({ source: 'all' })
  const { ids, shortSubjects } = selectExam(pool, { seed: Date.now() })
  return createSession('exam', { questionIds: ids, instantFeedback: false, shortSubjects })
}

export async function recordAnswer(input: {
  sessionId: number
  questionId: number
  chosenKey: string
}) {
  const question = db.select().from(questions).where(eq(questions.id, input.questionId)).get()
  if (!question) throw new Error(`Unknown question ${input.questionId}`)

  const isCorrect = question.correctKey === input.chosenKey
  const existing = db
    .select()
    .from(attempts)
    .where(and(eq(attempts.sessionId, input.sessionId), eq(attempts.questionId, input.questionId)))
    .get()

  if (existing) {
    db.update(attempts)
      .set({ chosenKey: input.chosenKey, isCorrect, answeredAt: Date.now() })
      .where(eq(attempts.id, existing.id))
      .run()
  } else {
    db.insert(attempts)
      .values({
        sessionId: input.sessionId,
        questionId: input.questionId,
        chosenKey: input.chosenKey,
        isCorrect,
        answeredAt: Date.now(),
      })
      .run()
  }
  revalidatePath(`/test/${input.sessionId}`)
}

export async function finishSession(sessionId: number) {
  db.update(sessions).set({ finishedAt: Date.now() }).where(eq(sessions.id, sessionId)).run()
  revalidatePath(`/results/${sessionId}`)
}

export async function toggleFlag(questionId: number) {
  const existing = db.select().from(questionMeta).where(eq(questionMeta.questionId, questionId)).get()
  const flagged = !(existing?.flagged ?? false)
  if (existing) {
    db.update(questionMeta)
      .set({ flagged, updatedAt: Date.now() })
      .where(eq(questionMeta.questionId, questionId))
      .run()
  } else {
    db.insert(questionMeta).values({ questionId, flagged, note: null, updatedAt: Date.now() }).run()
  }
  revalidatePath('/flagged')
  return flagged
}

export async function saveNote(questionId: number, note: string) {
  const existing = db.select().from(questionMeta).where(eq(questionMeta.questionId, questionId)).get()
  if (existing) {
    db.update(questionMeta)
      .set({ note, updatedAt: Date.now() })
      .where(eq(questionMeta.questionId, questionId))
      .run()
  } else {
    db.insert(questionMeta).values({ questionId, flagged: false, note, updatedAt: Date.now() }).run()
  }
  revalidatePath(`/question/${questionId}`)
}

export async function saveExplanation(questionId: number, explanation: string) {
  db.update(questions)
    .set({ explanation, explanationEditedAt: Date.now() })
    .where(eq(questions.id, questionId))
    .run()
  revalidatePath(`/question/${questionId}`)
}
```

- [ ] **Step 3: Verify the modules typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/aliraza/rmpose/sky_dive/dfv-trainer && git add -A && git commit -m "feat: add query layer and server actions"
```

---

### Task 6: Home screen and browse

**Files:**
- Modify: `app/layout.tsx`, `app/page.tsx`
- Create: `app/browse/page.tsx`
- Create: `components/QuestionImage.tsx`
- Create: `components/StartDrillForm.tsx`
- Create: `app/setup/page.tsx`

**Interfaces:**
- Consumes: `listSubjects`, `getOverallStats`, `getQuestions` from `lib/queries.ts`; `createDrillSession`, `createExamSession` from `lib/actions.ts`; `EXAM_SIZE`, `PER_CAT` from `lib/constants.ts`
- Produces: `<QuestionImage src={string | null} />` from `components/QuestionImage.tsx` — renders nothing when `src` is null and logs a warning when the image fails to load

- [ ] **Step 1: Write the image component**

Create `components/QuestionImage.tsx`:

```typescript
'use client'

export function QuestionImage({ src }: { src: string | null }) {
  if (!src) return null
  return (
    <img
      src={src}
      alt=""
      className="my-4 max-h-80 rounded-lg border border-neutral-200 dark:border-neutral-800"
      onError={() => console.warn(`missing question image: ${src}`)}
    />
  )
}
```

- [ ] **Step 2: Write the setup screen (missing database guard)**

Create `app/setup/page.tsx`:

```typescript
export default function SetupPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Database not ready</h1>
      <p className="mt-4 text-neutral-600 dark:text-neutral-400">
        The question bank has not been loaded yet. From the project root, run:
      </p>
      <pre className="mt-4 rounded-lg bg-neutral-100 p-4 text-sm dark:bg-neutral-900">
        npm run extract{'\n'}npm run explain{'\n'}npm run seed
      </pre>
    </main>
  )
}
```

- [ ] **Step 3: Write the drill start form**

Create `components/StartDrillForm.tsx`:

```typescript
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
          className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
          {[10, 20, 50].map((n) => (
            <option key={n} value={n}>
              {n} questions
            </option>
          ))}
        </select>
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
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
          className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="all">Whole bank</option>
          <option value="flagged">Flagged only</option>
          <option value="missed">Previously missed</option>
        </select>
      </div>
      <button
        onClick={start}
        disabled={pending}
        className="w-fit rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Starting…' : 'Start drill'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 4: Write the home page**

Replace `app/page.tsx`:

```typescript
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { StartDrillForm } from '@/components/StartDrillForm'
import { EXAM_SIZE, PASS, PER_CAT } from '@/lib/constants'
import { createExamSession } from '@/lib/actions'
import { getOverallStats, listSubjects } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default function Home() {
  let subjects: ReturnType<typeof listSubjects>
  let stats: ReturnType<typeof getOverallStats>
  try {
    subjects = listSubjects()
    stats = getOverallStats()
  } catch {
    redirect('/setup')
  }
  if (subjects.length === 0) redirect('/setup')

  async function startExam() {
    'use server'
    const id = await createExamSession()
    redirect(`/test/${id}`)
  }

  const accuracy = stats.attempts ? Math.round((stats.correct / stats.attempts) * 100) : null

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <h1 className="text-3xl font-semibold tracking-tight">DFV Theory Trainer</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        {subjects.reduce((sum, s) => sum + s.count, 0)} questions across {subjects.length} subjects.
        Pass mark is {Math.round(PASS * 100)}% in every subject.
      </p>

      <div className="mt-6 flex flex-wrap gap-6 text-sm text-neutral-600 dark:text-neutral-400">
        <span>{stats.attempts} answers recorded</span>
        {accuracy !== null && <span>{accuracy}% overall accuracy</span>}
        {stats.lastExamPercent !== null && (
          <span>Last exam: {Math.round(stats.lastExamPercent)}%</span>
        )}
        <Link href="/flagged" className="text-blue-600 hover:underline">
          {stats.flaggedCount} flagged
        </Link>
      </div>

      <section className="mt-10 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="text-lg font-medium">Quick drill</h2>
        <p className="mb-4 mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          Answers marked immediately, with the explanation.
        </p>
        <StartDrillForm subjects={subjects} />
      </section>

      <section className="mt-6 rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
        <h2 className="text-lg font-medium">Exam simulation</h2>
        <p className="mb-4 mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          The real format: {PER_CAT} questions from each of the {subjects.length} subjects,{' '}
          {EXAM_SIZE} in total. No feedback until the end.
        </p>
        <form action={startExam}>
          <button className="rounded-lg bg-neutral-900 px-5 py-2.5 font-medium text-white dark:bg-white dark:text-neutral-900">
            Start exam
          </button>
        </form>
      </section>

      <Link href="/browse" className="mt-6 inline-block text-blue-600 hover:underline">
        Browse all questions →
      </Link>
    </main>
  )
}
```

- [ ] **Step 5: Write the browse page**

Create `app/browse/page.tsx`:

```typescript
import Link from 'next/link'
import { getSelectablePool, getQuestions, listSubjects } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string; q?: string }>
}) {
  const { subject, q } = await searchParams
  const subjects = listSubjects()
  const ids = getSelectablePool({ subject, source: 'all' }).map((entry) => entry.id)
  const needle = (q ?? '').toLowerCase()
  const rows = getQuestions(ids).filter(
    (question) => needle === '' || question.stem.toLowerCase().includes(needle),
  )

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Browse ({rows.length})</h1>

      <form className="mt-4 flex flex-wrap gap-3">
        <select
          name="subject"
          defaultValue={subject ?? ''}
          className="rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">All subjects</option>
          {subjects.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search question text"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button className="rounded-lg border border-neutral-300 px-4 py-2 dark:border-neutral-700">
          Search
        </button>
      </form>

      <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map((question) => (
          <li key={question.id} className="py-3">
            <Link href={`/question/${question.id}`} className="block hover:opacity-70">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                {question.subject} · No {question.number}
                {question.flagged && ' · flagged'}
              </span>
              <p className="mt-1">{question.stem}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 6: Run the app and check the home and browse screens**

```bash
cd /Users/aliraza/rmpose/sky_dive/dfv-trainer && npm run dev
```

Open `http://localhost:3000` — it should show 513 questions across 7 subjects and the two mode cards. Open `http://localhost:3000/browse` and confirm the list renders and the subject filter works.

- [ ] **Step 7: Commit**

```bash
cd /Users/aliraza/rmpose/sky_dive/dfv-trainer && git add -A && git commit -m "feat: add home screen, browse and setup guard"
```

---

### Task 7: Test runner

**Files:**
- Create: `app/test/[sessionId]/page.tsx`
- Create: `components/TestRunner.tsx`

**Interfaces:**
- Consumes: `getSession`, `getQuestions`, `getSessionAttempts` from `lib/queries.ts`; `recordAnswer`, `finishSession`, `toggleFlag` from `lib/actions.ts`; `QuestionImage` from Task 6
- Produces: the runner UI at `/test/[sessionId]`; navigating to `/results/[sessionId]` on finish

- [ ] **Step 1: Write the runner client component**

Create `components/TestRunner.tsx`:

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
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

  const question = questions[index]
  const chosen = answers[question.id]
  const revealed = instantFeedback && chosen !== undefined
  const answeredCount = Object.keys(answers).length

  function choose(letter: string) {
    if (revealed) return
    setAnswers((prev) => ({ ...prev, [question.id]: letter }))
    startTransition(() => {
      void recordAnswer({ sessionId, questionId: question.id, chosenKey: letter })
    })
  }

  function flip() {
    const next = !flags[question.id]
    setFlags((prev) => ({ ...prev, [question.id]: next }))
    startTransition(() => {
      void toggleFlag(question.id)
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
```

- [ ] **Step 2: Write the runner page**

Create `app/test/[sessionId]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { TestRunner } from '@/components/TestRunner'
import { getQuestions, getSession, getSessionAttempts } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default async function TestPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = Number(sessionId)
  const session = getSession(id)
  if (!session) notFound()

  const questions = getQuestions(session.config.questionIds)
  const initialAnswers = Object.fromEntries(
    getSessionAttempts(id)
      .filter((a) => a.chosenKey !== null)
      .map((a) => [a.questionId, a.chosenKey as string]),
  )

  return (
    <>
      {session.config.shortSubjects && session.config.shortSubjects.length > 0 && (
        <p className="mx-auto max-w-3xl px-6 pt-6 text-sm text-amber-700 dark:text-amber-500 sm:px-10">
          Short exam: {session.config.shortSubjects.join(', ')} have fewer questions than the exam
          format requires, so this exam has {questions.length} questions.
        </p>
      )}
      <TestRunner
        sessionId={id}
        questions={questions}
        instantFeedback={session.config.instantFeedback}
        initialAnswers={initialAnswers}
        startedAt={session.startedAt}
      />
    </>
  )
}
```

- [ ] **Step 3: Run a drill end to end**

With `npm run dev` running, open `http://localhost:3000`, start a 10-question drill, answer a question wrong, and confirm: the correct option turns green, the chosen one red, the `whyWrong` line and the explanation both appear, the flag toggle switches, and the grid marks answered questions. Then start an exam and confirm no feedback appears on answering.

- [ ] **Step 4: Commit**

```bash
cd /Users/aliraza/rmpose/sky_dive/dfv-trainer && git add -A && git commit -m "feat: add test runner for drills and exam simulation"
```

---

### Task 8: Results and review

**Files:**
- Create: `app/results/[sessionId]/page.tsx`

**Interfaces:**
- Consumes: `getSession`, `getQuestions`, `getSessionAttempts` from `lib/queries.ts`; `score` from `lib/exam.ts`; `PASS` from `lib/constants.ts`; `QuestionImage` from Task 6

- [ ] **Step 1: Write the results page**

Create `app/results/[sessionId]/page.tsx`. Unanswered questions count as wrong, which is why the score is computed over the session's full question list rather than over the recorded attempts.

```typescript
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { QuestionImage } from '@/components/QuestionImage'
import { PASS } from '@/lib/constants'
import { score } from '@/lib/exam'
import { getQuestions, getSession, getSessionAttempts } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default async function ResultsPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const id = Number(sessionId)
  const session = getSession(id)
  if (!session) notFound()

  const questions = getQuestions(session.config.questionIds)
  const attemptsByQuestion = new Map(getSessionAttempts(id).map((a) => [a.questionId, a]))

  // An unanswered question counts as wrong.
  const result = score(
    questions.map((q) => ({
      subject: q.subject,
      isCorrect: attemptsByQuestion.get(q.id)?.isCorrect ?? false,
    })),
  )

  const isExam = session.mode === 'exam'
  const missed = questions.filter((q) => !(attemptsByQuestion.get(q.id)?.isCorrect ?? false))
  const failedSubjects = result.subjects.filter((s) => !s.passed).map((s) => s.subject)

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Home
      </Link>

      <h1 className="mt-4 text-3xl font-semibold">{Math.round(result.overallPercent)}%</h1>
      <p className="text-neutral-600 dark:text-neutral-400">
        {questions.length - missed.length} of {questions.length} correct
      </p>

      <div
        className={`mt-4 rounded-lg p-4 ${
          result.passed
            ? 'bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-200'
            : 'bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200'
        }`}
      >
        {isExam
          ? result.passed
            ? `Pass — ${Math.round(PASS * 100)}% or better in every subject.`
            : `Not a pass. You need ${Math.round(PASS * 100)}% in every subject — short in ${failedSubjects.join(', ')}.`
          : result.passed
            ? `Practice drill — above the ${Math.round(PASS * 100)}% threshold in every subject covered.`
            : `Practice drill — below the ${Math.round(PASS * 100)}% threshold in ${failedSubjects.join(', ')}.`}
      </div>

      <table className="mt-8 w-full text-sm">
        <thead className="border-b border-neutral-200 text-left dark:border-neutral-800">
          <tr>
            <th className="py-2">Subject</th>
            <th className="py-2 text-right">Correct</th>
            <th className="py-2 text-right">%</th>
            <th className="py-2 text-right">Verdict</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {result.subjects.map((s) => (
            <tr key={s.subject}>
              <td className="py-2">{s.subject}</td>
              <td className="py-2 text-right tabular-nums">
                {s.correct}/{s.total}
              </td>
              <td className="py-2 text-right tabular-nums">{Math.round(s.percent)}%</td>
              <td className={`py-2 text-right ${s.passed ? 'text-green-600' : 'text-red-600'}`}>
                {s.passed ? 'pass' : `below ${Math.round(PASS * 100)}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-10 text-lg font-medium">
        {missed.length ? `Review — ${missed.length} missed` : 'Nothing missed'}
      </h2>
      <div className="mt-4 flex flex-col gap-6">
        {missed.map((question) => {
          const attempt = attemptsByQuestion.get(question.id)
          const chosen = question.options.find((o) => o.letter === attempt?.chosenKey)
          const correct = question.options.find((o) => o.letter === question.correctKey)!
          return (
            <div
              key={question.id}
              className="rounded-xl border border-neutral-200 p-5 dark:border-neutral-800"
            >
              <p className="text-xs uppercase tracking-wide text-neutral-500">
                {question.subject} · No {question.number}
              </p>
              <p className="mt-1 whitespace-pre-line">{question.stem}</p>
              <QuestionImage src={question.imagePath} />
              <p className="mt-3 text-sm text-red-700 dark:text-red-400">
                <b>Your answer:</b>{' '}
                {chosen ? `${chosen.letter.toUpperCase()}) ${chosen.text}` : 'not answered'}
              </p>
              {chosen?.whyWrong && (
                <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{chosen.whyWrong}</p>
              )}
              <p className="mt-2 text-sm text-green-700 dark:text-green-400">
                <b>Correct:</b> {correct.letter.toUpperCase()}) {correct.text}
              </p>
              <p className="mt-2 text-sm">
                {question.explanation ?? (
                  <span className="text-neutral-500">Explanation not generated.</span>
                )}
              </p>
              <Link
                href={`/question/${question.id}`}
                className="mt-3 inline-block text-sm text-blue-600 hover:underline"
              >
                Open question →
              </Link>
            </div>
          )
        })}
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify results against a finished session**

With `npm run dev` running, finish a drill in which you deliberately leave one question unanswered and get one wrong. Confirm: both appear in the review list, the unanswered one shows "not answered", and the per-subject table counts the unanswered question in its subject's total.

- [ ] **Step 3: Commit**

```bash
cd /Users/aliraza/rmpose/sky_dive/dfv-trainer && git add -A && git commit -m "feat: add results and review screen"
```

---

### Task 9: Question detail and flagged list

**Files:**
- Create: `app/question/[id]/page.tsx`
- Create: `app/flagged/page.tsx`
- Create: `components/QuestionEditor.tsx`

**Interfaces:**
- Consumes: `getQuestion`, `getSelectablePool`, `getQuestions` from `lib/queries.ts`; `saveExplanation`, `saveNote`, `toggleFlag`, `createDrillSession` from `lib/actions.ts`; `QuestionImage` from Task 6

- [ ] **Step 1: Write the editor component**

Create `components/QuestionEditor.tsx`:

```typescript
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
```

- [ ] **Step 2: Write the question detail page**

Create `app/question/[id]/page.tsx`:

```typescript
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { QuestionEditor } from '@/components/QuestionEditor'
import { QuestionImage } from '@/components/QuestionImage'
import { getQuestion } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const question = getQuestion(Number(id))
  if (!question) notFound()

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <Link href="/browse" className="text-sm text-blue-600 hover:underline">
        ← Browse
      </Link>

      <p className="mt-4 text-xs uppercase tracking-wide text-neutral-500">
        {question.subject} · No {question.number}
      </p>
      <h1 className="mt-1 whitespace-pre-line text-xl">{question.stem}</h1>
      <QuestionImage src={question.imagePath} />

      <ul className="mt-6 flex flex-col gap-2">
        {question.options.map((option) => (
          <li
            key={option.letter}
            className={`rounded-lg border px-4 py-3 ${
              option.letter === question.correctKey
                ? 'border-green-600 bg-green-50 dark:bg-green-950'
                : 'border-neutral-300 dark:border-neutral-700'
            }`}
          >
            <span className="mr-2 font-medium uppercase">{option.letter})</span>
            {option.text}
            {option.whyWrong && (
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">{option.whyWrong}</p>
            )}
          </li>
        ))}
      </ul>

      <QuestionEditor
        questionId={question.id}
        initialExplanation={question.explanation ?? ''}
        initialNote={question.note ?? ''}
        initialFlagged={question.flagged}
      />
    </main>
  )
}
```

- [ ] **Step 3: Write the flagged list**

Create `app/flagged/page.tsx`:

```typescript
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createDrillSession } from '@/lib/actions'
import { getQuestions, getSelectablePool } from '@/lib/queries'

export const dynamic = 'force-dynamic'

export default function FlaggedPage() {
  const ids = getSelectablePool({ source: 'flagged' }).map((entry) => entry.id)
  const rows = getQuestions(ids)

  async function drillFlagged() {
    'use server'
    const id = await createDrillSession({ count: 100, source: 'flagged' })
    redirect(`/test/${id}`)
  }

  return (
    <main className="mx-auto max-w-3xl p-6 sm:p-10">
      <Link href="/" className="text-sm text-blue-600 hover:underline">
        ← Home
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Flagged ({rows.length})</h1>

      {rows.length > 0 && (
        <form action={drillFlagged} className="mt-4">
          <button className="rounded-lg bg-blue-600 px-5 py-2.5 font-medium text-white">
            Drill these
          </button>
        </form>
      )}

      <ul className="mt-6 divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map((question) => (
          <li key={question.id} className="py-3">
            <Link href={`/question/${question.id}`} className="block hover:opacity-70">
              <span className="text-xs uppercase tracking-wide text-neutral-500">
                {question.subject} · No {question.number}
              </span>
              <p className="mt-1">{question.stem}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 4: Verify the full loop**

With `npm run dev` running: flag a question from a drill, open `/flagged` and confirm it is listed, click through to `/question/[id]`, edit the explanation and save, then re-run `npm run seed` and reload the page — the edited explanation must survive. Start a flagged drill from `/flagged` and confirm it contains only flagged questions.

- [ ] **Step 5: Run the whole test suite and typecheck**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all tests pass, no type errors, production build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/aliraza/rmpose/sky_dive/dfv-trainer && git add -A && git commit -m "feat: add question detail editor and flagged list"
```

---

## Running the app

```bash
cd /Users/aliraza/rmpose/sky_dive/dfv-trainer && npm run dev
```

To reach it from a phone on the same network, run `npm run dev -- -H 0.0.0.0` and open `http://<your-mac-ip>:3000`.
