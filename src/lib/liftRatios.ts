/**
 * Conversions between a lift that's actually trainable and the lift a goal is
 * named for.
 *
 * Pure module — no React/DOM, no storage.
 */

import type { WorkoutRow } from '../types'
import { epley1RM } from './epley'
import { leadVariantForKey } from './pushVariant'

/**
 * The back squat a leg press implies: multiply a leg-press e1RM by this to read
 * it as a squat.
 *
 * The two movements are nowhere near equivalent, which is the whole reason a raw
 * leg-press number can't be dropped into a squat goal. The press sits you down,
 * supports the spine, takes the hips through a shorter range and asks nothing of
 * the trunk, so the load it moves runs far above the bar it stands in for. Male
 * strength tables put the averages at roughly 1.4× bodyweight squatted against
 * 2.9× pressed at the same bodyweight, and the published squat/leg-press ratios
 * cluster between 0.4 and 0.5 — hence 0.45, a little under the midpoint of what
 * the tables imply.
 *
 * It's one number for a comparison that genuinely varies: a 45° plate-loaded
 * sled, a horizontal seated press and a pin-loaded machine all read differently
 * at the same effort, and a sled whose display ignores the carriage understates
 * itself further. So this is deliberately the conservative end — the squat it
 * credits is one the press has clearly earned rather than the best case. It's a
 * single constant precisely so it can be re-tuned against a real attempt: the
 * squat goals aren't handed out on this estimate anyway (see goals.GoalSpec's
 * `singles` — the target has to be lifted for real to count).
 */
export const LEG_PRESS_TO_SQUAT = 0.45

/**
 * The flat bench an incline bench implies when there isn't enough history to
 * measure it (see {@link inclineToFlat}): multiply an incline e1RM by this to
 * read it as a flat one.
 *
 * Incline is the harder press — the steeper angle hands more of the work to the
 * front delts and shortens the leverage the chest gets — so the same effort moves
 * less weight. The usual figure has an incline max at 80–90% of a flat one, which
 * puts the conversion between 1.11 and 1.25; 1.15 (incline at about 87% of flat)
 * is the middle of that.
 */
export const INCLINE_TO_FLAT = 1.15

/**
 * The bounds a measured incline-to-flat ratio is held inside. Below 1 would say
 * incline is the stronger press, which is a logging slip rather than a lifter;
 * above 1.25 is past the far end of the published range.
 */
export const INCLINE_TO_FLAT_MIN = 1
export const INCLINE_TO_FLAT_MAX = 1.25

/**
 * How many recent fresh sessions of each press the measured ratio reads, and how
 * few it will settle for before falling back to {@link INCLINE_TO_FLAT}.
 */
const CALIBRATION_SESSIONS = 4
const CALIBRATION_MIN_SESSIONS = 2

/**
 * The flat bench an incline bench implies, for this lifter: the ratio of their
 * recent flat bench to their recent incline, each read on the days it was done
 * fresh.
 *
 * The textbook 1.15 was too generous here. Logged against each other, the two
 * presses ran about 94% apart, not 87%, so every incline-led push day entered
 * the bench line some ten pounds above the flat days either side of it — and a
 * flat PR the next day read as the line dropping. Measuring the ratio instead of
 * assuming it puts both kinds of day on one level, and keeps them there as the
 * two lifts move at their own pace.
 *
 * A press counts as fresh in a session whose A/B variant is the one that lifts it
 * first (see pushVariant.leadVariantForKey), or in a session with no variant
 * recorded that trained it alone. The press done second is tired, and comparing
 * a tired incline against a fresh flat would read fatigue as the gap between the
 * lifts. Each fresh session reads as the average e1RM of its sets — the same
 * scoring the bench line uses (see progress.combinedAverage1RMSeries) — and the
 * ratio is the mean of the last {@link CALIBRATION_SESSIONS} fresh flat sessions
 * over the mean of the last as many fresh incline ones. The alternating plan
 * means those two windows cover the same few weeks.
 *
 * One ratio for the whole history rather than one per date: it's a property of
 * the lifter and the bench, and a ratio that moved under old points would redraw
 * the past every week. Too little history, or a result outside the published
 * range, falls back or clamps (see {@link INCLINE_TO_FLAT_MIN}).
 */
export function inclineToFlat(rows: WorkoutRow[]): number {
  const flat = freshAverages(rows, 'flat_bench')
  const incline = freshAverages(rows, 'incline_bench')
  if (flat.length < CALIBRATION_MIN_SESSIONS || incline.length < CALIBRATION_MIN_SESSIONS) {
    return INCLINE_TO_FLAT
  }
  const ratio = mean(flat.slice(-CALIBRATION_SESSIONS)) / mean(incline.slice(-CALIBRATION_SESSIONS))
  const clamped = Math.min(INCLINE_TO_FLAT_MAX, Math.max(INCLINE_TO_FLAT_MIN, ratio))
  return Math.round(clamped * 1000) / 1000
}

/** Each fresh session's average e1RM on `key`, oldest → newest. */
function freshAverages(rows: WorkoutRow[], key: string): number[] {
  const lead = leadVariantForKey(key)
  const bySession = new Map<
    string,
    { date: string; variant?: string; alone: boolean; e1rms: number[] }
  >()
  for (const r of rows) {
    if (r.exercise !== 'flat_bench' && r.exercise !== 'incline_bench') continue
    const id = r.session_id || r.date
    const g = bySession.get(id) ?? { date: r.date, alone: true, e1rms: [] }
    if (g.variant == null && r.variant) g.variant = r.variant
    if (r.exercise !== key) g.alone = false
    else if (r.weight_lbs != null && r.reps > 0) g.e1rms.push(epley1RM(r.weight_lbs, r.reps))
    bySession.set(id, g)
  }
  return [...bySession.values()]
    .filter((g) => g.e1rms.length > 0 && (g.variant != null ? g.variant === lead : g.alone))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((g) => mean(g.e1rms))
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}
