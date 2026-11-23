/**
 * The words a guided session uses in more than one place, kept here so the set
 * card, the checklist and the circuit card can't drift apart, and so the lift
 * workout and the stretch routine ask the same question the same way.
 *
 * Pure module — no React/DOM.
 */

/**
 * What the number beside the reps is called for this exercise: a pin on a
 * numbered stack, the plate added to a bodyweight move, pounds otherwise.
 */
export function loadWord(ex: { bodyweight?: boolean; stackSetting?: boolean }): string {
  return ex.bodyweight ? 'added lbs' : ex.stackSetting ? 'setting' : 'lbs'
}

/**
 * What to ask before a session is finished and logged from its menu with sets
 * still owed, or null when nothing is left and there is nothing to ask.
 */
export function finishEarlyPrompt(done: number, all: number): string | null {
  const left = all - done
  if (left <= 0) return null
  return `finish and log with ${left} ${left === 1 ? 'set' : 'sets'} left?`
}
