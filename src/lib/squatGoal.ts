/** Pure math for the bodyweight-relative squat strength goal. No side effects. */

/** Milestone: squatting 1× your bodyweight. */
export const SQUAT_MILESTONE_MULT = 1
/** Target: squatting 1.5× your bodyweight. */
export const SQUAT_TARGET_MULT = 1.5

const round1 = (n: number): number => Math.round(n * 10) / 10
const round2 = (n: number): number => Math.round(n * 100) / 100

export type SquatGoal = {
  /** Current estimated 1RM (lbs), 0 if none logged. */
  est1RM: number
  /** Reference bodyweight (lbs) from the latest weigh-in, 0 if none. */
  bodyweight: number
  /** est1RM as a multiple of bodyweight (0 when bodyweight is unknown). */
  multiple: number
  /** 1× bodyweight (lbs). */
  milestone: number
  /** 1.5× bodyweight (lbs). */
  target: number
  hitMilestone: boolean
  hitTarget: boolean
}

/**
 * Compare an estimated squat 1RM against bodyweight, exposing the 1× milestone
 * and 1.5× target and how far along the lift is. Bodyweight of 0 (no weigh-in)
 * yields a 0 multiple and unmet thresholds.
 */
export function squatBodyweightGoal(est1RM: number, bodyweight: number): SquatGoal {
  const bw = bodyweight > 0 ? bodyweight : 0
  const milestone = round1(bw * SQUAT_MILESTONE_MULT)
  const target = round1(bw * SQUAT_TARGET_MULT)
  return {
    est1RM: round1(est1RM),
    bodyweight: round1(bw),
    multiple: bw > 0 ? round2(est1RM / bw) : 0,
    milestone,
    target,
    hitMilestone: bw > 0 && est1RM >= milestone,
    hitTarget: bw > 0 && est1RM >= target,
  }
}
