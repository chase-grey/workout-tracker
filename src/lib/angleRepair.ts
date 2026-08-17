import type { FlexEntry } from './flex'

/**
 * A one-time correction of the angles logged before the measurement math
 * accounted for the photo's aspect ratio.
 *
 * Handles are stored normalized per axis, so on a 3:4 shot one step across the
 * frame covers a much shorter distance than one step down. Until 2026-08-05 the
 * angle was computed as though the two axes shared a scale, which stretched x by
 * height/width and read every reading wider than it was: a side split whose
 * lines were 96.0° apart logged as 111.6°.
 *
 * Only the number survived — neither the handles nor the photo's real aspect was
 * ever stored — so the repair inverts the old math instead of recomputing it,
 * under two assumptions: the shot was 3:4 (what the phone camera hands back),
 * and a side split sits roughly symmetrically about the vertical. On the photo
 * that turned this up, inverting 111.6° gives 95.6° where a protractor app
 * measuring the same lines says 95.4°.
 *
 * What this can't tell apart: an angle typed in by hand during the window (those
 * were already right, and come out too small), and a photo shot at some aspect
 * other than 3:4 (a picked file rather than a capture), which lands short of the
 * truth rather than on it. Both are worth it against leaving readings that are
 * 15° too generous in the log.
 */

/** Aspect (width / height) of a full-frame phone camera shot held in portrait. */
const PHOTO_ASPECT = 3 / 4

/**
 * The window in which a logged angle came out of the un-corrected math: from the
 * day photo measurement shipped to the day the aspect fix did, both inclusive.
 *
 * The fix landed in the evening of the closing day, so a reading taken after it
 * on that date gets corrected as though it hadn't been. Nothing in an entry says
 * which side of the deploy it came from, and every reading from that date we can
 * account for is a pre-fix one.
 */
export const REPAIR_FROM = '2026-07-21'
export const REPAIR_TO = '2026-08-05'

/** Angles measured as one wedge spanning both legs, so each side is half of it. */
const SPLIT_FIELDS = ['splitDeg', 'coldSplitDeg', 'warmSplitDeg'] as const

/** Angles measured as a single line off the vertical. */
const VERTICAL_FIELDS = [
  'tailorsLeftDeg',
  'tailorsRightDeg',
  'tailorsColdLeftDeg',
  'tailorsColdRightDeg',
  'tailorsWarmLeftDeg',
  'tailorsWarmRightDeg',
] as const

const round1 = (n: number) => Math.round(n * 10) / 10

/**
 * The angle a single line really made with the vertical, given what the old math
 * reported for it. That direction had its x component divided by the aspect
 * ratio; multiplying it back and re-reading the angle undoes exactly that, for
 * any reading from 0 to 180 (a line below the vertex included).
 */
function trueOffVertical(deg: number): number {
  const r = (deg * Math.PI) / 180
  return (Math.atan2(PHOTO_ASPECT * Math.sin(r), Math.cos(r)) * 180) / Math.PI
}

/** Correct one reading measured off the vertical, e.g. a tailor's knee line. */
export const repairOffVertical = (deg: number): number => round1(trueOffVertical(deg))

/**
 * Correct one side-split reading. The wedge spans both legs, so each leg sits at
 * half of it off the vertical — correct that half and double it back.
 */
export const repairSplit = (deg: number): number => round1(2 * trueOffVertical(deg / 2))

/**
 * Flex entries with the readings from the un-corrected window put right, plus
 * just the entries that changed — those have to go back to the backend, which
 * holds the inflated numbers too and would hand them straight back on the next
 * fetch. Entries outside the window are returned untouched, by identity.
 */
export function repairFlexAngles(entries: FlexEntry[]): {
  entries: FlexEntry[]
  repaired: FlexEntry[]
} {
  const repaired: FlexEntry[] = []
  const out = entries.map((e) => {
    if (e.date < REPAIR_FROM || e.date > REPAIR_TO) return e
    const fixed = { ...e }
    let changed = false
    for (const f of SPLIT_FIELDS) {
      const v = fixed[f]
      if (v == null) continue
      fixed[f] = repairSplit(v)
      changed = changed || fixed[f] !== v
    }
    for (const f of VERTICAL_FIELDS) {
      const v = fixed[f]
      if (v == null) continue
      fixed[f] = repairOffVertical(v)
      changed = changed || fixed[f] !== v
    }
    if (!changed) return e
    repaired.push(fixed)
    return fixed
  })
  return { entries: out, repaired }
}
