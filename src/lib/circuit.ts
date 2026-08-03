/**
 * Set ordering for circuits.
 *
 * Normally a day is performed one exercise at a time: all of its sets, then on
 * to the next. Exercises that share a `circuit` id are performed as a rotation
 * instead — one set at each station, round after round — so two movements for the
 * same muscle never land in back-to-back sets and the block finishes faster,
 * since each muscle recovers while the others work.
 *
 * Only a *consecutive* run of exercises sharing an id forms a circuit, so the
 * same id reused later in a day is a separate circuit rather than one that
 * teleports across the workout.
 *
 * Pure module — no React/DOM.
 */

/** One set of one exercise, as a position in the day's exercise list. */
export type SetSlot = { exIndex: number; setIndex: number }

/**
 * Flatten a day's exercises into the order its sets should be performed in.
 * `setCounts[i]` is how many sets exercise `i` has (taken from the live log, so
 * an added or removed set reshapes the order immediately).
 *
 * Uneven set counts inside a circuit are fine: a station that has run out of
 * sets is skipped, so the remaining stations finish their last rounds together.
 */
export function buildSetOrder(exercises: { circuit?: string }[], setCounts: number[]): SetSlot[] {
  const out: SetSlot[] = []
  let i = 0
  while (i < exercises.length) {
    const id = exercises[i].circuit
    if (!id) {
      for (let s = 0; s < (setCounts[i] ?? 0); s++) out.push({ exIndex: i, setIndex: s })
      i += 1
      continue
    }
    // The consecutive run of stations sharing this circuit id.
    let end = i
    while (end < exercises.length && exercises[end].circuit === id) end += 1
    const stations = []
    for (let k = i; k < end; k++) stations.push(k)
    const rounds = Math.max(0, ...stations.map((k) => setCounts[k] ?? 0))
    for (let s = 0; s < rounds; s++) {
      for (const k of stations) {
        if (s < (setCounts[k] ?? 0)) out.push({ exIndex: k, setIndex: s })
      }
    }
    i = end
  }
  return out
}
