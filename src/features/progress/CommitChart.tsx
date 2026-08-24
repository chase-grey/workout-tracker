/**
 * Picking the date a goal gets committed to, by dragging it.
 *
 * A projected ETA is an estimate, and the moment it comes within reach the only
 * question left is what you're actually willing to sign up for — which is rarely
 * the estimate. Typing a date into a field answers that blind: it says nothing
 * about how much steeper "six weeks sooner" makes the climb. Dragging the
 * finish line along the target does, because the curve you'd have to hold
 * redraws under your thumb while the machine's own projection stays put behind
 * it as the thing you're bargaining against.
 */

import { useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import type { Projection } from '../../lib/predictions'
import { type Point } from '../../lib/progress'
import {
  addDays,
  clampToRange,
  commitRange,
  lockProjection,
  lockProjectionByDate,
  projectedSeries,
} from '../../lib/goalLock'
import { LINE_GOAL, LINE_GOAL_LABEL, LINE_PRIMARY, niceScale, timeXAxis, withTime } from '../../lib/chart'
import { parseISODate, toISODate } from '../../lib/dates'
import { AxisBreak } from '../../components/AxisBreak'
import { ChartTag } from '../../components/ChartTag'

const MS_PER_DAY = 86_400_000
const axisTick = { fill: '#737373', fontSize: 10 }

/** Plot-area insets, matching the chart's own margins and Y-axis width. */
const PLOT_LEFT = 40
const PLOT_RIGHT = 10
/** A drag has to travel this far horizontally before it takes over from a scroll. */
const DRAG_SLOP_PX = 6

/** How far a keyboard arrow moves the date. */
const KEY_STEP_DAYS = 7

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

function daysBetween(from: string, to: string): number {
  return Math.round((parseISODate(to).getTime() - parseISODate(from).getTime()) / MS_PER_DAY)
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${m}/${d}/${y.slice(2)}`
}

/** Merge the history and the two forward curves into one row per date. */
function mergeRows(
  actual: Point[],
  reference: Point[],
  candidate: Point[],
): { date: string; actual?: number; reference?: number; candidate?: number }[] {
  const m = new Map<string, { date: string; actual?: number; reference?: number; candidate?: number }>()
  const at = (date: string) => {
    const row = m.get(date) ?? { date }
    m.set(date, row)
    return row
  }
  for (const p of actual) at(p.date).actual = p.value
  for (const p of reference) at(p.date).reference = p.value
  for (const p of candidate) at(p.date).candidate = p.value
  return [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
}

/**
 * The goal's run-up, the projection the app generated, and the line the chosen
 * date would commit you to — with the finish handle sitting on the target,
 * draggable along it.
 *
 * The two forward curves are drawn the same way and differ only in where they
 * land, so at the projected date they lie exactly on top of each other and every
 * bit of daylight between them is distance the user's own choice opened up.
 */
export function CommitChart({
  goalId,
  proj,
  points,
  date,
  onChange,
  estimate,
  now,
}: {
  goalId: string
  proj: Projection
  /** The goal's logged history. */
  points: Point[]
  /** The date currently chosen, ISO. */
  date: string
  onChange: (iso: string) => void
  /**
   * The estimate being bargained against: the date the drag window opens around
   * and the mark the handle is measured away from. Defaults to the projection's
   * own ETA — a goal changing a date it already committed to passes the estimate
   * its held pace implies instead, which is the answer that has actually moved
   * since it committed (see paceAgainstLock).
   */
  estimate?: string
  /** Overridable clock, for tests. */
  now?: Date
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const dragFrom = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  // Read once and held: a fresh clock every render would rebuild the reference
  // curve mid-drag, which is exactly the thing that has to stay still.
  const [today] = useState(() => now ?? new Date())

  const eta = estimate ?? proj.etaDate!
  const range = useMemo(() => commitRange(proj, eta, today), [proj, eta, today])

  // The machine's answer, frozen once: it must not move while the handle does,
  // or there'd be nothing steady to bargain against.
  const reference = useMemo(() => {
    const lock = lockProjection(goalId, proj, today)
    return lock ? projectedSeries(lock) : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalId, proj])

  const candidate = useMemo(() => {
    const lock = lockProjectionByDate(goalId, proj, date, today)
    return lock ? projectedSeries(lock) : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goalId, proj, date])

  const rows = useMemo(
    () => withTime(mergeRows(points, reference, candidate)),
    [points, reference, candidate],
  )

  const { current, target } = proj
  const yScale = useMemo(
    () => niceScale([...points.map((p) => p.value), current, target]),
    [points, current, target],
  )

  // Fixed to the full drag window rather than to the data, so the handle can run
  // all the way to either end without the axis rescaling underneath it. The tail
  // padding keeps the handle's date label off the right edge.
  const xDomain = useMemo(() => {
    const min = Math.min(...rows.map((r) => r.t), parseISODate(toISODate(today)).getTime())
    const max = parseISODate(range.latest).getTime()
    return [min, max + (max - min) * 0.06] as [number, number]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, range.latest])

  /**
   * The date under a pointer at `clientX`, clamped to the drag window.
   *
   * Measured off the chart's own SVG rather than the card around it, so the
   * card's padding never has to be part of the sum — only the chart's margins and
   * the Y axis, which this file sets itself.
   */
  const dateAt = (clientX: number): string => {
    const svg = wrap.current?.querySelector('svg')
    if (!svg) return date
    const rect = svg.getBoundingClientRect()
    const left = rect.left + PLOT_LEFT
    const right = rect.right - PLOT_RIGHT
    const frac = clamp((clientX - left) / Math.max(1, right - left), 0, 1)
    return inRange(toISODate(new Date(xDomain[0] + frac * (xDomain[1] - xDomain[0]))))
  }

  /** `iso` held inside the commit window. */
  const inRange = (iso: string): string => clampToRange(iso, range)

  // Dragging only takes over once the pointer has moved sideways past the slop,
  // so a thumb travelling down the page still scrolls it.
  const onPointerDown = (e: React.PointerEvent) => {
    dragFrom.current = e.clientX
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragFrom.current == null) return
    if (!dragging) {
      if (Math.abs(e.clientX - dragFrom.current) < DRAG_SLOP_PX) return
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragging(true)
    }
    onChange(dateAt(e.clientX))
  }

  const endDrag = (e: React.PointerEvent) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    dragFrom.current = null
    setDragging(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? -KEY_STEP_DAYS : e.key === 'ArrowRight' ? KEY_STEP_DAYS : 0
    if (step === 0) return
    e.preventDefault()
    onChange(inRange(addDays(date, step)))
  }

  // Everything hangs on the side of the target line the curve has already left:
  // under it for a goal that climbs, above it for one that falls. ChartTag flips
  // a tag that won't fit there rather than letting it run off the plot.
  const rising = proj.target > proj.current
  const tagSide = rising ? 'below' : 'above'
  const chosenMs = parseISODate(date).getTime()
  const projectedMs = parseISODate(eta).getTime()
  // Two dots on one line: hide the machine's when the choice is sitting on it.
  const showReferenceDot = Math.abs(daysBetween(eta, date)) > 3

  return (
    <div
      ref={wrap}
      role="slider"
      tabIndex={0}
      aria-label="target date"
      aria-valuemin={parseISODate(range.soonest).getTime()}
      aria-valuemax={parseISODate(range.latest).getTime()}
      aria-valuenow={chosenMs}
      aria-valuetext={fmtDate(date)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      className="mt-3 touch-pan-y select-none rounded-xl bg-surface-2 p-1 outline-none focus-visible:ring-1 focus-visible:ring-accent-2"
    >
      <ResponsiveContainer width="100%" height={170}>
        {/* The slider above is the thing to focus here; Recharts' own focus layer
            would put a second focus box inside it, around the plot. */}
        <LineChart
          data={rows}
          margin={{ top: 6, right: 10, bottom: 0, left: 0 }}
          accessibilityLayer={false}
        >
          <CartesianGrid stroke="#262626" vertical={false} />
          <XAxis {...timeXAxis} domain={xDomain} tick={axisTick} />
          <YAxis
            tick={axisTick}
            width={40}
            domain={yScale.domain}
            ticks={yScale.ticks}
            allowDecimals={false}
            interval={0}
          />
          <AxisBreak broken={yScale.broken} bg="#262626" />
          {/* No tooltip: a pointer on this chart is a drag, not a read. */}
          <ReferenceLine
            y={proj.target}
            stroke={LINE_GOAL}
            strokeDasharray="5 4"
            label={<ChartTag text={`goal ${proj.target}`} color={LINE_GOAL_LABEL} bg="#262626" side={tagSide} />}
          />
          {/* The machine's date, left behind as the handle moves away from it. */}
          {showReferenceDot && (
            <ReferenceDot
              x={projectedMs}
              y={proj.target}
              r={3.5}
              fill={LINE_GOAL}
              stroke="#0a0a0a"
              label={
                <ChartTag text={fmtDate(eta)} color={LINE_GOAL_LABEL} bg="#262626" align="center" side={tagSide} />
              }
            />
          )}
          <Line
            type="monotone"
            dataKey="reference"
            name="projected"
            stroke={LINE_GOAL}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="candidate"
            name="committing to"
            stroke={LINE_PRIMARY}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="actual"
            stroke={LINE_PRIMARY}
            strokeWidth={2}
            dot={{ r: 2 }}
            isAnimationActive={false}
            connectNulls
          />
          {/* The handle, drawn last so it sits over the lines it controls. A
              filled dot inside a ring reads as something to take hold of rather
              than another plotted point, and it grows while held. */}
          <ReferenceDot
            x={chosenMs}
            y={proj.target}
            r={dragging ? 9 : 7}
            fill="#0a0a0a"
            stroke={LINE_PRIMARY}
            strokeWidth={2}
            label={
              <ChartTag
                text={fmtDate(date)}
                color={LINE_PRIMARY}
                bg="#262626"
                size={10}
                weight={600}
                align="center"
                side={tagSide}
              />
            }
          />
          <ReferenceDot x={chosenMs} y={proj.target} r={3} fill={LINE_PRIMARY} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
