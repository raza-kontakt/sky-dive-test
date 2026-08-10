import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

const dbPath = path.join(process.cwd(), 'data', 'app.db')
const db = new Database(dbPath, { readonly: true })

console.log('='.repeat(80))
console.log('DATABASE ANALYTICS - DFV Theory Trainer')
console.log('='.repeat(80))
console.log()

// Get all tables
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all() as { name: string }[]

console.log('📊 TABLES OVERVIEW')
console.log('-'.repeat(80))
tables.forEach((t) => {
  const count = db.prepare(`SELECT COUNT(*) as count FROM ${t.name}`).get() as { count: number }
  console.log(`  ${t.name}: ${count.count.toLocaleString()} records`)
})
console.log()

// Schema information
console.log('📋 TABLE SCHEMAS')
console.log('-'.repeat(80))
tables.forEach((table) => {
  const schema = db.prepare(`PRAGMA table_info(${table.name})`).all() as any[]
  console.log(`\n${table.name}:`)
  schema.forEach((col) => {
    const nullable = col.notnull ? 'NOT NULL' : 'nullable'
    const pk = col.pk ? ' [PRIMARY KEY]' : ''
    console.log(`  • ${col.name}: ${col.type} ${nullable}${pk}`)
  })
})
console.log()

// Detailed analytics
console.log('📈 DETAILED ANALYTICS')
console.log('-'.repeat(80))

// Subjects
const subjects = db.prepare('SELECT * FROM subjects ORDER BY name').all() as any[]
console.log('\n1. SUBJECTS:')
subjects.forEach((s) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM questions WHERE subject_id = ?').get(s.id) as {
    count: number
  }
  console.log(`   • ${s.name}: ${count.count} questions`)
})

const totalQuestions = db.prepare('SELECT COUNT(*) as count FROM questions').get() as { count: number }
console.log(`   Total Questions: ${totalQuestions.count}`)
console.log()

// Questions with images
const questionsWithImages = db.prepare('SELECT COUNT(*) as count FROM questions WHERE image_path IS NOT NULL').get() as {
  count: number
}
console.log(
  `2. QUESTIONS WITH IMAGES: ${questionsWithImages.count}/${totalQuestions.count} (${Math.round((questionsWithImages.count / totalQuestions.count) * 100)}%)`
)
console.log()

// Options
const totalOptions = db.prepare('SELECT COUNT(*) as count FROM options').get() as { count: number }
const avgOptionsPerQuestion = (totalOptions.count / totalQuestions.count).toFixed(2)
console.log(`3. OPTIONS: ${totalOptions.count} total (avg ${avgOptionsPerQuestion} per question)`)
console.log()

// Sessions and attempts
const sessions = db.prepare('SELECT COUNT(*) as count FROM sessions').all() as { count: number }[]
const finishedSessions = db
  .prepare('SELECT COUNT(*) as count FROM sessions WHERE finished_at IS NOT NULL')
  .get() as { count: number }
const totalAttempts = db.prepare('SELECT COUNT(*) as count FROM attempts').get() as { count: number }

console.log(`4. PRACTICE DATA:`)
console.log(`   • Sessions: ${sessions[0].count}`)
console.log(`   • Finished Sessions: ${finishedSessions.count}`)
console.log(`   • Total Attempts: ${totalAttempts.count}`)

if (totalAttempts.count > 0) {
  const correctAttempts = db
    .prepare('SELECT COUNT(*) as count FROM attempts WHERE is_correct = 1')
    .get() as { count: number }
  const accuracy = ((correctAttempts.count / totalAttempts.count) * 100).toFixed(2)
  console.log(`   • Correct Answers: ${correctAttempts.count}`)
  console.log(`   • Overall Accuracy: ${accuracy}%`)
}
console.log()

// Flagged questions
const flaggedQuestions = db
  .prepare('SELECT COUNT(*) as count FROM question_meta WHERE flagged = 1')
  .get() as { count: number }
console.log(`5. FLAGGED QUESTIONS: ${flaggedQuestions.count}`)

// Question meta
const questionsWithNotes = db
  .prepare("SELECT COUNT(*) as count FROM question_meta WHERE note IS NOT NULL AND note != ''")
  .get() as { count: number }
const questionsWithEditedExplanations = db
  .prepare('SELECT COUNT(*) as count FROM questions WHERE explanation_edited_at IS NOT NULL')
  .get() as { count: number }
console.log(`6. QUESTION METADATA:`)
console.log(`   • Questions with Notes: ${questionsWithNotes.count}`)
console.log(`   • Questions with Edited Explanations: ${questionsWithEditedExplanations.count}`)
console.log()

// Session modes
const sessionModes = db
  .prepare('SELECT mode, COUNT(*) as count FROM sessions GROUP BY mode ORDER BY count DESC')
  .all() as { mode: string; count: number }[]
console.log(`7. SESSION MODES:`)
sessionModes.forEach((mode) => {
  console.log(`   • ${mode.mode}: ${mode.count}`)
})
console.log()

// Database file size
const stats = fs.statSync(dbPath)
const sizeMB = (stats.size / (1024 * 1024)).toFixed(2)
console.log(`8. DATABASE FILE:`)
console.log(`   • Path: ${dbPath}`)
console.log(`   • Size: ${sizeMB} MB`)
console.log(`   • Created: ${stats.birthtime.toLocaleDateString()}`)
console.log()

// Relationship mapping
console.log('🔗 RELATIONSHIP MAPPING')
console.log('-'.repeat(80))
console.log(`
subjects (7 subjects)
  ↓ (one-to-many)
questions (513 questions)
  ↓ (one-to-many)
  ├─ options (4 options per question = ~2052 options)
  └─ question_meta (flagging, notes, tracking)

sessions (practice/exam sessions)
  ↓ (one-to-many)
attempts (individual question attempts)
  ├─ references questions
  └─ references sessions
`)
console.log()

console.log('='.repeat(80))
db.close()
