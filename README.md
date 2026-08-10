# DFV Theory Trainer

A comprehensive practice app for the Deutscher Fallschirmsportverband (DFV) skydiving theory exam. It
stores the full 513-question bank in SQLite and provides instant-feedback drills with flexible sizing,
a 98-question exam simulation with per-subject pass/fail verdicts, flagged question management, private
notes, and AI-generated explanations for every question and wrong answer.

See `docs/superpowers/specs/2026-08-09-dfv-trainer-design.md` for the full design.

## Features

- **Flexible Drills**: Practice with 5, 10, 20, 50, 100, or 150 questions at a time
- **Category Filtering**: Select specific subjects (Aerodynamics, Equipment, Freefall, etc.) or practice all
- **Instant Feedback**: Get immediate answers and explanations for every question
- **Flagged Questions**: Mark questions for review and practice them separately by category
- **Exam Simulation**: Full 98-question exam with per-subject grading (14 questions per subject × 7 subjects)
- **Personal Notes**: Add private notes to each question for your own study
- **Question Filtering**: Filter by subject, whole bank, flagged only, or previously missed questions
- **Statistics**: Track overall accuracy, past exam results, and flagged question counts
- **Browser Access**: Use on desktop or mobile over LAN

## Running it

### Development

```bash
npm run dev
```

Open http://localhost:3000. The dev server also listens on your machine's LAN address, so you can
use it from a phone on the same Wi-Fi: find your computer's local IP (on macOS, System Settings →
Wi-Fi → Details, or `ipconfig getifaddr en0`) and open `http://<that-ip>:3000` on the phone.

### Docker

Build and run the app in Docker:

```bash
docker build -t dfv-trainer .
docker run -d -p 3100:3000 dfv-trainer
```

Open http://localhost:3100 (or your machine's IP on port 3100 for LAN access).

The Docker container includes:
- SQLite database with seeded question bank
- Pre-built Next.js production bundle
- Automatic database initialization on first run

See `DEPLOYMENT.md` for detailed deployment instructions.

## Using the App

### Home Screen

The main screen offers three practice modes:

1. **Quick Drill** - Instant feedback practice with configurable options:
   - Question count: 5, 10, 20, 50, 100, or 150
   - Source: All questions, Flagged only, or Previously missed
   - Subject: All subjects or specific category

2. **Practice Flagged Questions** *(appears when you have flagged questions)*
   - **Practice All Flagged**: Run through all flagged questions at once
   - **Practice by Category**: Focus on flagged questions from specific subjects

3. **Exam Simulation** - Full 98-question exam:
   - 14 questions per subject across all 7 subjects
   - No feedback until completion
   - Per-subject pass/fail grading (75% required per subject)

### Question Management

**Flagging**: Mark questions during practice or on the detail page for later review. Flagged questions
appear as a dedicated practice option on the home screen.

**Notes**: Add personal study notes to any question that persist in the database.

**Explanations**: Every wrong answer includes a generated explanation of why it's incorrect.

## One-time data pipeline

The database is not part of the repo and has to be built once, in this order:

```bash
npm run extract  # DFV_Theory_Trainer.html -> data/bank.json + public/q/*.png
npm run explain  # data/bank.json -> data/explanations.json (calls the Claude API)
npm run seed     # data/bank.json + data/explanations.json -> data/app.db
```

`npm run extract` reads the source trainer HTML and writes the question bank and images.

`npm run explain` generates an explanation and a per-wrong-answer note for every question by
calling the Claude API. It requires an `ANTHROPIC_API_KEY` environment variable and costs a few
dollars for a full run (~513 questions). It is resumable — rerunning it only fills in whatever is
still missing from `data/explanations.json` — so it's safe to stop and restart if it's interrupted.

`npm run seed` loads the bank and explanations into `data/app.db`. If you skip `npm run explain`,
the app still runs; every question just shows a "not generated" explanation until you run it.

## Re-seeding

Re-running `npm run seed` after updating `data/bank.json` or `data/explanations.json` is safe:
flags, notes, past attempts, and any explanation you've hand-edited in the app all survive. Only
the question/option text and any explanation that hasn't been edited get refreshed from the source
files.

## Other scripts

```bash
npm test             # vitest unit tests
npm run lint         # eslint
npm run build        # production build
npm run db:generate  # regenerate drizzle migrations after a schema change
npm run db:migrate   # apply migrations directly (npm run seed does this automatically)
```
