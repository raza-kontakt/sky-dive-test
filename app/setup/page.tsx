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
