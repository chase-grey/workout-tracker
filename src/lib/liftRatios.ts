/**
 * Conversions between a lift that's actually trainable and the lift a goal is
 * named for.
 *
 * Pure module — no React/DOM, no storage.
 */

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
 * The flat bench an incline bench implies: multiply an incline e1RM by this to
 * read it as a flat one.
 *
 * Incline is the harder press — the steeper angle hands more of the work to the
 * front delts and shortens the leverage the chest gets — so the same effort moves
 * less weight. The usual figure has an incline max at 80–90% of a flat one, which
 * puts the conversion between 1.11 and 1.25; 1.15 (incline at about 87% of flat)
 * is the conservative side of the middle. Counting incline at face value instead
 * treated every incline day as a weaker bench day than it was, so the goal line
 * dipped on every variant-A push day and leaned on the flat readings to recover.
 *
 * Like the leg-press ratio this is one number for a comparison that varies with
 * the bench's angle, and it's a single constant so it can be re-tuned. It only
 * moves the estimate: the bench goals are still settled by a real single, and an
 * incline single counts at face value there (see goals.BENCH_SCALE).
 */
export const INCLINE_TO_FLAT = 1.15
