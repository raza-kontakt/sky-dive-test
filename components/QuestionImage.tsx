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
