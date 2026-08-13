import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db/client'
import { options, questions, subjects } from '../db/schema'
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

function key(record: { subject: string; number: number }) {
  return `${record.subject}#${record.number}`
}

// The database is the durable store; data/explanations.json is only the portable
// artifact that carries explanations to a fresh deployment, and it is gitignored.
// Reading what the database already holds means a lost or partial JSON file costs
// a re-read rather than 500 regenerated explanations.
async function loadFromDatabase(): Promise<ExplanationRecord[]> {
  let rows: { subject: string; number: number; explanation: string | null; letter: string | null; whyWrong: string | null }[]
  try {
    rows = await db
      .select({
        subject: subjects.name,
        number: questions.number,
        explanation: questions.explanation,
        letter: options.letter,
        whyWrong: options.whyWrong,
      })
      .from(questions)
      .innerJoin(subjects, eq(subjects.id, questions.subjectId))
      .leftJoin(options, eq(options.questionId, questions.id))
  } catch (error) {
    // Database not yet initialized or not accessible — nothing to recover, not a failure.
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('relation') && !message.includes('connection')) throw error
    return []
  }

  const byQuestion = new Map<string, ExplanationRecord>()
  for (const row of rows) {
    if (row.explanation === null) continue
    const id = key(row)
    const record = byQuestion.get(id) ?? { subject: row.subject, number: row.number, explanation: row.explanation, whyWrong: [] }
    if (row.letter !== null && row.whyWrong !== null) record.whyWrong.push({ letter: row.letter, text: row.whyWrong })
    byQuestion.set(id, record)
  }
  return [...byQuestion.values()]
}

const existing: ExplanationRecord[] = existsSync(OUT_PATH)
  ? JSON.parse(readFileSync(OUT_PATH, 'utf8')).records
  : []
const done = new Set(existing.map(key))
const records = [...existing]

let recovered: ExplanationRecord[] = []

// Rename is atomic, so a crash mid-write leaves either the old complete file or the
// new complete file, never a truncated one that would corrupt the resumable run.
function writeRecordsAtomic(records: ExplanationRecord[]) {
  const tmpPath = `${OUT_PATH}.tmp`
  writeFileSync(tmpPath, JSON.stringify({ records }, null, 2))
  renameSync(tmpPath, OUT_PATH)
}

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

// Authentication failures are systemic, not per-question — every remaining call would
// fail identically, so the run should abort immediately instead of burning through all
// 513 questions and writing an explanations file with zero records. The SDK throws two
// different shapes for this: a typed `AuthenticationError` for a 401 response from the
// server, and a plain `Error` thrown client-side, before any request is sent, when no
// credentials can be resolved at all (the case with no ANTHROPIC_API_KEY set).
function isFatalAuthError(error: unknown): boolean {
  if (error instanceof Anthropic.AuthenticationError) return true
  return error instanceof Error && error.message.includes('Could not resolve authentication method')
}

async function explain(q: BankQuestion): Promise<ExplanationRecord | null> {
  try {
    // Thinking is on by default on Opus 5, and max_tokens caps thinking plus the
    // structured output together — 4000 left a five-option explanation liable to
    // truncate into `stop_reason: max_tokens` and a null parsed_output. These are
    // short study notes, so low effort keeps the run cheap across ~500 questions.
    const response = await client.messages.parse({
      model: 'claude-opus-5',
      max_tokens: 8000,
      system: SYSTEM,
      messages: [{ role: 'user', content: buildContent(q) }],
      output_config: { effort: 'low', format: zodOutputFormat(ExplanationSchema) },
    })
    const parsed = response.parsed_output
    if (!parsed) throw new Error(`no parsed output (stop_reason: ${response.stop_reason})`)
    return { subject: q.subject, number: q.number, ...parsed }
  } catch (error) {
    if (isFatalAuthError(error)) throw error
    console.error(`failed ${q.subject}#${q.number}:`, error instanceof Error ? error.message : error)
    return null
  }
}

async function main() {
  recovered = (await loadFromDatabase()).filter((record) => !done.has(key(record)))
  for (const record of recovered) {
    records.push(record)
    done.add(key(record))
  }

  const pending = bank.questions.filter((q) => !done.has(key(q)))
  console.log(
    `${records.length} already generated${recovered.length ? ` (${recovered.length} recovered from database)` : ''}, ${pending.length} to go`,
  )

  // Persist recovered records up front so the artifact is repaired even when there
  // is nothing left to generate and the loop below never runs.
  if (recovered.length) writeRecordsAtomic(records)

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    const batch = pending.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(explain))
    for (const result of results) if (result) records.push(result)
    writeRecordsAtomic(records)
    console.log(`${records.length}/${bank.questions.length}`)
  }

  console.log(`wrote ${OUT_PATH} — ${records.length} of ${bank.questions.length} questions have explanations`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
