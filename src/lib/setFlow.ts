/**
 * Where the guided workout flow goes next, once sets can be done out of order.
 *
 * The set order {@link buildSetOrder} lays out is the *plan*; the checklist lets
 * you jump anywhere in it, so what's on screen and what's been logged drift
 * apart. From then on "next" can't mean the step one along: that walks straight
 * back into sets already logged, and (having jumped ahead) calls the workout
 * finished with sets still owed.
 *
 * Next means the nearest unfinished step *ahead* of the one on screen. Only when
 * nothing is left ahead does it come back around for what was left behind —
 * otherwise skipping an exercise early would drag you backwards for the rest of
 * the workout instead of at the end, when it's all that's left.
 *
 * The step on screen is never a candidate, in either sweep: it's the one being
 * left, and a set the flow can't mark finished (no reps entered, say) would
 * otherwise hold the workout on it forever.
 *
 * Pure module — no React/DOM. `done[i]` is whether step `i` is already logged.
 */

/** The step to move to from `from`, or null when nothing is left unfinished. */
export function nextUnfinishedStep(done: boolean[], from: number): number | null {
  for (let i = from + 1; i < done.length; i++) if (!done[i]) return i
  // Nothing ahead: come back around for whatever was skipped.
  for (let i = 0; i < Math.min(from, done.length); i++) if (!done[i]) return i
  return null
}

/**
 * Every step still to be performed, in the order the flow will reach them,
 * starting with `from` itself (it's on screen, finished or not). Used to price
 * the rest of the workout: each step's rest depends on which step follows it, so
 * the estimate has to walk the same order the flow will.
 */
export function remainingFlow(done: boolean[], from: number): number[] {
  if (from < 0 || from >= done.length) return []
  const out = [from]
  const seen = new Set([from])
  let at = from
  for (;;) {
    const next = nextUnfinishedStep(done, at)
    // A wrap that lands on something already walked means the loop has closed.
    if (next === null || seen.has(next)) return out
    seen.add(next)
    out.push(next)
    at = next
  }
}
