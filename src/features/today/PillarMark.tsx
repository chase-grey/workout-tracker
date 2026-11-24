import type { IconType } from 'react-icons'
import { MdDirectionsRun, MdFitnessCenter, MdRestaurant, MdSelfImprovement } from 'react-icons/md'
import type { Pillar } from '../../lib/profile'
import { markTone, type CalendarStatus } from '../../lib/weekCalendar'

const GLYPH: Record<Pillar, IconType> = {
  strength: MdFitnessCenter,
  flexibility: MdSelfImprovement,
  cardio: MdDirectionsRun,
  diet: MdRestaurant,
}

const TONE = { lit: 'text-accent', dim: 'text-neutral-600' }

/**
 * The calendar's mark for one pillar on one day: a dumbbell for a lift, a
 * seated figure for a stretch, a runner for cardio, a fork and knife for the
 * calorie target. The shape says which; the colour says only whether it
 * happened (see `markTone`). No status keeps the mark's room and draws nothing,
 * so a column of them stays in step with the columns beside it.
 *
 * A `count` of two or more rides the mark's bottom right corner: the sessions
 * of that pillar the day held. It hangs outside the mark's box, so a counted
 * mark takes the same room as a bare one.
 */
export function PillarMark({
  pillar,
  status,
  size,
  count,
}: {
  pillar: Pillar
  status: CalendarStatus | null
  size: number
  count?: number
}) {
  const Glyph = GLYPH[pillar]
  const tone = markTone(status)
  const glyph = (
    <Glyph aria-hidden className={`shrink-0 ${tone ? TONE[tone] : 'invisible'}`} style={{ width: size, height: size }} />
  )
  if (!tone || !count || count < 2) return glyph
  return (
    <span className="relative flex shrink-0">
      {glyph}
      <span
        aria-hidden
        className={`absolute left-full top-full -ml-0.5 -mt-1.5 text-[8px] font-bold leading-none tabular-nums ${TONE[tone]}`}
      >
        {count}
      </span>
    </span>
  )
}
