import { bigint, boolean, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'

export const subjects = pgTable('subjects', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
})

export const questions = pgTable(
  'questions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    subjectId: integer('subject_id')
      .notNull()
      .references(() => subjects.id),
    number: integer('number').notNull(),
    stem: text('stem').notNull(),
    imagePath: text('image_path'),
    correctKey: text('correct_key').notNull(),
    explanation: text('explanation'),
    explanationEditedAt: bigint('explanation_edited_at', { mode: 'number' }),
  },
  (t) => [uniqueIndex('questions_subject_number').on(t.subjectId, t.number)],
)

export const options = pgTable(
  'options',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    questionId: integer('question_id')
      .notNull()
      .references(() => questions.id),
    letter: text('letter').notNull(),
    text: text('text').notNull(),
    whyWrong: text('why_wrong'),
  },
  (t) => [uniqueIndex('options_question_letter').on(t.questionId, t.letter)],
)

export const questionMeta = pgTable('question_meta', {
  questionId: integer('question_id')
    .primaryKey()
    .references(() => questions.id),
  flagged: boolean('flagged').notNull().default(false),
  note: text('note'),
  updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
})

export const sessions = pgTable('sessions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  mode: text('mode').notNull(),
  configJson: text('config_json').notNull(),
  startedAt: bigint('started_at', { mode: 'number' }).notNull(),
  finishedAt: bigint('finished_at', { mode: 'number' }),
})

export const attempts = pgTable(
  'attempts',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    sessionId: integer('session_id')
      .notNull()
      .references(() => sessions.id),
    questionId: integer('question_id')
      .notNull()
      .references(() => questions.id),
    chosenKey: text('chosen_key'),
    isCorrect: boolean('is_correct').notNull().default(false),
    answeredAt: bigint('answered_at', { mode: 'number' }),
  },
  (t) => [uniqueIndex('attempts_session_question').on(t.sessionId, t.questionId)],
)
