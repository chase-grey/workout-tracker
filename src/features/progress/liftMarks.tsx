import { exerciseName } from '../../config/plan'
import { LINE_PRIMARY, MARK_OTHER_LIFT } from '../../lib/chart'

/**
 * Marks for a goal line that reads more than one lift: the bench goals take the
 * better of flat and incline each day, the squat goals the leg press or a barbell
 * squat. The line is one series, but which lift each point came off is worth
 * seeing — so the dots carry it (progress.Point's `from`), and a key under the
 * chart says which is which.
 */

/** The props recharts hands a custom dot. */
type DotProps = { cx?: number; cy?: number; index?: number; payload?: { from?: string } }

/**
 * A `dot` renderer for a goal's actual line: the goal's own lift in the line's
 * accent, a reading off the companion lift in a lighter (or, on paper, darker)
 * shade of it and a touch larger so it reads at a glance.
 */
export function liftDot(mainLift: string | null) {
  return function LiftDot({ cx, cy, index, payload }: DotProps) {
    if (cx == null || cy == null) return <g key={index} />
    const other = mainLift != null && payload?.from != null && payload.from !== mainLift
    return (
      <circle
        key={index}
        cx={cx}
        cy={cy}
        r={other ? 3 : 2}
        fill={other ? MARK_OTHER_LIFT : LINE_PRIMARY}
        stroke={other ? MARK_OTHER_LIFT : LINE_PRIMARY}
      />
    )
  }
}

/** The lifts a series' points came off, the goal's own first. */
function liftsIn(points: Record<string, unknown>[], mainLift: string | null): string[] {
  const seen = new Set(points.map((p) => p.from).filter((f): f is string => typeof f === 'string'))
  if (mainLift == null || seen.size === 0 || (seen.size === 1 && seen.has(mainLift))) return []
  return [mainLift, ...[...seen].filter((f) => f !== mainLift)]
}

/** Which dot is which lift — drawn only when the line actually mixes them. */
export function LiftKey({ points, mainLift }: { points: Record<string, unknown>[]; mainLift: string | null }) {
  const lifts = liftsIn(points, mainLift)
  if (lifts.length === 0) return null
  return (
    <div className="flex justify-center gap-3 pb-1 text-[10px] text-neutral-400">
      {lifts.map((lift) => (
        <span key={lift} className="flex items-center gap-1">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: lift === mainLift ? LINE_PRIMARY : MARK_OTHER_LIFT }}
          />
          {exerciseName(lift)}
        </span>
      ))}
    </div>
  )
}
