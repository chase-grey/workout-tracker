/**
 * The three settings of the hands-free toggle (see components/FastForwardToggle).
 *
 * `on` hands the *rests* over to the clock: each one rolls into the next set the
 * moment it's up. The set itself still waits — the numbers on screen are a claim
 * about what you just lifted, and nothing logs that for you.
 *
 * `turbo` hands the sets over too: the numbers on screen are accepted on their
 * own after however long this exercise usually takes you (see
 * {@link turboSetMs}), so a whole workout of prefilled targets runs without a
 * tap. Pressing the toggle again comes back around to off.
 *
 * Pure module — no React/DOM.
 */

import { WORK_PER_SET_SEC, type ExerciseAverages } from './estimate'

export type FastMode = 'off' | 'on' | 'turbo'

/** In press order, which is also least to most hands-free. */
const CYCLE: FastMode[] = ['off', 'on', 'turbo']

/**
 * The mode a press of the toggle lands on. `allowTurbo` false stops at on/off —
 * for the stretch routine, where every set that can advance itself already does
 * under `on` and there's no learned per-set timing to run the rest on.
 */
export function nextFastMode(mode: FastMode, allowTurbo = true): FastMode {
  const order = allowTurbo ? CYCLE : CYCLE.slice(0, 2)
  const at = order.indexOf(mode)
  // An unknown (or turbo-when-not-allowed) mode reads as being past the end of
  // the cycle, so a press from it switches off rather than sticking.
  return at < 0 ? 'off' : order[(at + 1) % order.length]
}

/** Whether rest runs itself out into the next set instead of waiting for a tap. */
export function rollsThroughRest(mode: FastMode): boolean {
  return mode === 'on' || mode === 'turbo'
}

/**
 * Coerce a persisted value into a mode. Builds before turbo stored a bare
 * boolean, and `true` meant what `on` means now.
 */
export function toFastMode(raw: unknown): FastMode {
  if (raw === true) return 'on'
  return raw === 'on' || raw === 'turbo' ? raw : 'off'
}

/**
 * Never sit on a set screen for less than this before accepting it. A learned
 * average can be genuinely tiny — a station whose reps are prefilled and whose
 * sets you tap straight through — and turbo firing a second after the screen
 * appears reads as a glitch rather than a set.
 */
export const TURBO_MIN_SEC = 12

/** And never longer than this, whatever a freak average says. */
export const TURBO_MAX_SEC = 5 * 60

/**
 * How long turbo waits on one set of `exercise` before logging the numbers on
 * screen: that exercise's learned average active seconds per set — the same
 * measurement the time-left estimate is built from — held inside the sane band.
 *
 * Until this lift has been timed even once, the structural per-set guess stands
 * in, so turbo works on day one instead of only after a history exists.
 */
export function turboSetMs(averages: ExerciseAverages, exercise: string): number {
  const learned = averages.active[exercise]
  const sec = learned && learned.n > 0 && isFinite(learned.avgSec) ? learned.avgSec : WORK_PER_SET_SEC
  return Math.min(TURBO_MAX_SEC, Math.max(TURBO_MIN_SEC, sec)) * 1000
}
