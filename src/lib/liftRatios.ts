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
