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
