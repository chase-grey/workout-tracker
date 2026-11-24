import type { MeasureMode, MeasureResult } from './measure'

/**
 * The numbers a pose produces, for typing them in rather than reading them off a
 * photo: the same fields the camera fills (see measure.MeasureResult), one per
 * angle, in the order the pose reads them.
 */
export const MANUAL_FIELDS: Record<MeasureMode, { key: keyof MeasureResult; label: string }[]> = {
  split: [{ key: 'splitDeg', label: 'side split' }],
  tailors: [
    { key: 'tailorsLeftDeg', label: 'left' },
    { key: 'tailorsRightDeg', label: 'right' },
  ],
  toe_touch: [{ key: 'toeTouchDeg', label: 'toe touch' }],
  leg_lift_left: [{ key: 'legLiftLeftDeg', label: 'left leg lift' }],
  leg_lift_right: [{ key: 'legLiftRightDeg', label: 'right leg lift' }],
  pelvic_tilt: [{ key: 'pelvicTiltDeg', label: 'pelvic tilt' }],
}

/** One typed angle as a whole number of degrees, or null if it isn't an angle. */
function parseDeg(text: string): number | null {
  if (text.trim() === '') return null
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0 || n > 180) return null
  return Math.round(n)
}

/**
 * The reading typed angles make, in the shape a measured photo hands back, so it
 * is logged down the same path. Every angle the pose has must be there: a paired
 * pose is charted on the average of its sides (see goals.buildGoals), and one
 * side typed without the other would read as the pose having changed. Null until
 * they all are — whole degrees, 0 to 180, the range a photo can produce.
 */
export function manualResult(mode: MeasureMode, values: string[]): MeasureResult | null {
  const result: MeasureResult = {}
  const fields = MANUAL_FIELDS[mode]
  for (let i = 0; i < fields.length; i++) {
    const deg = parseDeg(values[i] ?? '')
    if (deg == null) return null
    result[fields[i].key] = deg
  }
  return result
}
