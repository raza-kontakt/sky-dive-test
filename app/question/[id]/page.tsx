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
        initialExplanation={question.explanation || ''}
        initialNote={question.note ?? ''}
        initialFlagged={question.flagged}
      />
    </main>
  )
}
