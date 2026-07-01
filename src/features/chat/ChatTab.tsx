export function ChatTab() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 pb-24 pt-24 text-center">
      <span className="text-5xl">💬</span>
      <h2 className="text-xl font-bold">AI Chat — coming soon</h2>
      <p className="max-w-xs text-sm text-neutral-500">
        The data-aware training assistant is a post-MVP feature. It will use your OpenAI key
        (stored on this device only) and get context from your last 90 days of workouts, body
        weight, and streaks.
      </p>
    </div>
  )
}
