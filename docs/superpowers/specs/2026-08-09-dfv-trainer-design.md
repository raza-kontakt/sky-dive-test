# DFV Theory Trainer — Design

Date: 2026-08-09
Status: approved, ready for implementation planning

## Purpose

A practice app for the Deutscher Fallschirmsportverband (DFV) skydiving theory exam, used to
prepare for an AFF licence exam. It runs locally, stores the full official question bank in a
database, and — unlike the existing single-file HTML trainer — explains why a wrong answer is
wrong and what the correct reasoning is.

Success criteria:

- All 513 questions and all 15 images from the 2022 bank are in the database and renderable.
- Every question has an explanation of the correct answer and a per-distractor reason it is wrong.
- A 20-question drill and a full 98-question exam simulation both run end to end, score correctly,
  and produce a per-subject verdict against the 75% threshold.
- Flags and notes survive a re-seed of the question bank.

## Source material

| File | Role |
| --- | --- |
| `~/Downloads/DFV_Theory_Trainer.html` | **Primary source.** Contains `const DATA` (513 questions, 7 subjects) and `const IMGS` (15 base64 PNGs). All 15 image references resolve; no image is missing. |
| `~/Downloads/dfv_questionnaire_2022.md` | Partial (249 questions, 4 subjects). Cross-check only, not a source. |
| `~/Downloads/dfv_questionnaire-2022.pdf` | 90 pages, original. Not parsed; no PDF tooling on this machine and the HTML already covers the bank. |

Question counts per subject in the source: Behaviour in Special Circumstances 103, Freefall 96,
Equipment 90, Aerodynamics 82, Air Traffic Law 57, Meteorology 50, Human Performance 35.

Each source question has: subject (`c`), number (`n`), stem (`s`), four options (`o`),
correct letter (`k`), and an optional image key (`g`). There are no explanations in the source —
generating them is the largest single piece of content work in this project.

## Exam rules

Taken from the existing trainer and treated as the real format:

- 14 questions from each of the 7 subjects, 98 total.
- Pass requires **≥75% in every subject**, not 75% overall.
- These two numbers live in one constants module (`PASS = 0.75`, `PER_CAT = 14`).

## Stack

- Next.js 15, app router, TypeScript
- SQLite via `better-sqlite3`, accessed through Drizzle ORM
- Tailwind CSS
- vitest for unit tests

Runs locally with `npm run dev`, bound so a phone on the same LAN can use it. Project root:
`/Users/aliraza/rmpose/sky_dive/dfv-trainer/`.

## Architecture

Three one-time scripts feed the database, then the app only reads the bank and writes user data.

```
DFV_Theory_Trainer.html
        │
        ├─ scripts/extract.ts ──▶ data/bank.json + public/q/*.png
        │
        ├─ scripts/explain.ts ──▶ data/explanations.json   (Claude API, resumable)
        │
        └─ scripts/seed.ts    ──▶ data/app.db             (idempotent upsert)
                                        │
                                   Next.js app
```

The stages are deliberately separate. `explain.ts` is the slow, paid step; decoupling it means the
database can be rebuilt at any time without re-running it, and its output can be reviewed as plain
JSON before it reaches the database.

### `scripts/extract.ts`

Reads the trainer HTML, slices out the `const DATA` array and `const IMGS` object, parses them as
JSON, decodes each base64 image to `public/q/<key>.png`, and writes a normalised `data/bank.json`.

Fails loudly if: the array does not parse, the question count is not 513, a subject is unknown, a
question does not have exactly 4 options, the correct letter is outside a–d, or a `g` image key has
no matching entry in `IMGS`.

### `scripts/explain.ts`

For each question, calls the Claude API and requests structured output containing:

- `explanation` — why the correct answer is correct, in the terms a student sitting the exam needs.
- `whyWrong` — one entry per incorrect option, saying what that option confuses or misstates.

Behaviour: reads any existing `data/explanations.json` first and skips questions already present, so
a crashed or interrupted run resumes; writes incrementally after each batch rather than at the end;
limits concurrency; records failures in the output file with an error marker so they can be retried
by rerunning. Questions with an image get the image passed alongside the stem.

Expected cost is a one-off in the single-digit dollars. The generated text is not treated as
authoritative — it is stored in an editable column, and the review UI makes it easy to correct.

### `scripts/seed.ts`

Loads `bank.json` and `explanations.json` into SQLite. Upserts bank rows by `(subject, number)`. It
must never touch `question_meta` or `attempts`, and must not overwrite an `explanation` whose
`explanation_edited_at` is set. Running it twice in a row produces no user-visible change.

## Schema

```
subjects(id, name, slug)

questions(id, subject_id, number, stem, image_path, correct_key,
          explanation, explanation_edited_at)

options(id, question_id, letter, text, why_wrong)
          -- why_wrong is null for the correct option

question_meta(question_id PK, flagged, note, updated_at)

sessions(id, mode, config_json, started_at, finished_at)

attempts(id, session_id, question_id, chosen_key, is_correct, answered_at)
```

Two ownership zones, and the split is what makes re-seeding safe:

- **Seed-owned:** `subjects`, `questions`, `options`. Rebuilt from source. The one exception is
  `questions.explanation`, which the user may edit; `explanation_edited_at` marks it protected.
- **User-owned:** `question_meta`, `sessions`, `attempts`. Only ever written by the running app.

`question_meta` is a separate table rather than columns on `questions` precisely so that the seed
script can rewrite the bank without any risk to flags and notes.

## Modes

Each mode creates a `sessions` row recording its config.

**Quick drill.** Default 20 questions. Configurable count (10 / 20 / 50), subject filter (all or
one), and source pool (whole bank / flagged only / previously missed). Feedback is immediate after
each answer: correct or not, the correct option highlighted, the explanation, and the `why_wrong`
line for the specific option the user chose.

**Exam simulation.** Exactly `PER_CAT` questions from each of the 7 subjects, 98 total. No feedback
until the end. Timer counts up. A question grid allows jumping and going back, and marks which
questions are still unanswered. Flagging during an exam uses the same persistent flag as everywhere
else — there is no separate session-only "mark for review" concept. The result is a pass only if
every subject is at or above `PASS`.

**Flagged drill.** Every flagged question, immediate feedback, same runner as quick drill.

### Selection

Seeded-random, weighted to prefer questions with fewer prior attempts, so repeated practice spreads
across the bank instead of resampling the same questions. No duplicates within a session. Exam mode
takes exactly 14 per subject; if a subject holds fewer than 14 questions it takes all of them and
says so in the UI rather than silently producing a short exam.

## Screens

| Route | Content |
| --- | --- |
| `/` | Mode cards, last exam score, quick stats strip (total attempts, overall accuracy) |
| `/test/[sessionId]` | Runner: stem, image if present, options a–d, flag star, progress, question grid |
| `/results/[sessionId]` | Per-subject table with a pass/fail mark per subject, overall verdict, and a review list of every missed question with its explanation |
| `/question/[id]` | Detail view: edit explanation, write a private note, toggle flag |
| `/flagged` | Flagged questions, with a button to start a drill from them |
| `/browse` | All 513 by subject, searchable, read-only, links to detail |

## Scoring

- An unanswered question counts as wrong.
- Per-subject percentage is correct ÷ questions of that subject in the session.
- A subject passes at ≥ `PASS`. The session passes only if every subject present passes.
- Quick drills report the same per-subject breakdown but label the verdict as practice, since a
  drill is not the exam format.

## Error handling

- **Missing image file** — the question renders without it and the miss is logged. Not fatal.
- **Missing explanation** — review shows the correct answer text plus a "not generated" badge.
  Rerunning `explain.ts` picks up exactly the missing IDs.
- **Missing or unseeded database** — the app renders a setup screen telling the user to run
  `npm run seed`, rather than throwing.
- **Extraction mismatch** — `extract.ts` refuses to write a partial `bank.json`; the existing one
  stays valid.

## Testing

vitest, unit level. No end-to-end tests in v1.

- **Parser** against the real trainer HTML: 513 questions, 7 subjects with the exact counts above,
  15 images, every `g` reference resolves, every question has 4 options and a valid correct letter.
- **Selection**: exam mode yields exactly 14 per subject with no duplicates; drill respects count,
  subject filter, and pool; a same-seed run is reproducible.
- **Scoring**: unanswered counts wrong; per-subject pass logic; the boundary case where a subject
  sits just under 75% fails the whole exam despite a high overall score.
- **Seed idempotency**: seeding twice preserves flags, notes, attempts, and an edited explanation.

## Out of scope for v1

Deliberately deferred, in rough priority order for a later version:

- Spaced repetition scheduling of missed questions
- Stats dashboard with accuracy trends over time
- Full CRUD administration of questions (bank is read-only apart from explanations and notes)
- Deployment beyond localhost and LAN
- Multi-user support — the schema assumes a single user and has no user table
