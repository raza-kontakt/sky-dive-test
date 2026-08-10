# DFV Theory Trainer

A local practice app for the Deutscher Fallschirmsportverband (DFV) skydiving theory exam. It
stores the full 513-question bank in SQLite and adds instant-feedback drills, a 98-question exam
simulation with a per-subject pass/fail verdict, flags, private notes, and a generated explanation
for every question and wrong answer.

See `docs/superpowers/specs/2026-08-09-dfv-trainer-design.md` for the full design.

## Running it

```bash
npm run dev
```

Open http://localhost:3000. The dev server also listens on your machine's LAN address, so you can
use it from a phone on the same Wi-Fi: find your computer's local IP (on macOS, System Settings →
Wi-Fi → Details, or `ipconfig getifaddr en0`) and open `http://<that-ip>:3000` on the phone.

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
