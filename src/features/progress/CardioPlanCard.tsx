import { useMemo, useState } from 'react'
import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useData } from '../../store/DataContext'
import type { CardioEntry } from '../../lib/cardio'
import {
  addCheckpoint,
  cardioSessionsForWeek,
  chartMetric,
  checkpointStatuses,
  endCardioPlan,
  fmtClock,
  fmtDistance,
  goalLabel,
  parseClock,
  planActive,
  planChartRows,
  plannedDone,
  planStanding,
  removeCheckpoint,
  replanCardio,
  weekdayOf,
  WEEKDAY_NAMES,
  type CardioCheckpoint,
  type CardioPlan,
  type CheckpointStatus,
} from '../../lib/cardioPlan'
import { CHART_SURFACE, CHART_SURFACE_2, LINE_GOAL, LINE_PRIMARY, fmtTick, niceScale, timeXAxis } from '../../lib/chart'
import { parseISODate, toISODate, weekStartISO } from '../../lib/dates'
import { usePressAction } from '../../lib/usePressAction'
import { CardioGoalSheet } from '../today/CardioGoalSheet'
import { goalLineMarks } from './goalLineMarks'

const axisTick = { fill: '#737373', fontSize: 11 }
const tooltipStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12 }

function shortDate(iso: string): string {
  return parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toLowerCase()
}

/** Where a checkpoint sits on the plan's chart, in the chart's own unit — or nowhere, for one measured in another. */
function checkpointValue(c: CardioCheckpoint, plan: CardioPlan): number | null {
  const { unit } = chartMetric(plan)
  if (unit === 'mi') return c.withinMin == null ? c.distanceMi ?? null : null
  if (unit === 'time') return c.withinMin ?? null
  return c.weekMin ?? null
}

/**
 * The cardio goal on Progress: the plan week by week against what was done,
 * the goal line, and the checkpoints along it — drawn the way a committed
 * strength goal is, the plan dashed in the goal colour like a committed curve
 * and the log solid over it. Below it, this week's sessions, the checkpoints
 * (editable), and the plan's own controls. With no plan, the way to set one.
 */
export function CardioPlanCard() {
  const { settings, cardioEntries, updateSettings } = useData()
  const [setting, setSetting] = useState(false)
  const today = toISODate(new Date())
  const plan = planActive(settings.cardioPlan, today) ? settings.cardioPlan : undefined

  return (
    <>
      <h3 className="mt-2 text-sm font-semibold tracking-wider text-neutral-500">cardio goal</h3>
      {plan ? (
        <PlanBlock
          plan={plan}
          today={today}
          onEdit={() => setSetting(true)}
          onChange={(next) => updateSettings({ ...settings, cardioPlan: next })}
          entries={cardioEntries}
        />
      ) : (
        <button
          onClick={() => setSetting(true)}
          className="min-h-[52px] w-full rounded-2xl bg-surface font-semibold text-accent active:opacity-80"
        >
          set a cardio goal
        </button>
      )}
      {setting && <CardioGoalSheet onClose={() => setSetting(false)} />}
    </>
  )
}

function PlanBlock({
  plan,
  today,
  entries,
  onEdit,
  onChange,
}: {
  plan: CardioPlan
  today: string
  entries: CardioEntry[]
  onEdit: () => void
  onChange: (plan: CardioPlan) => void
}) {
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [editing, setEditing] = useState(false)
  const statuses = useMemo(() => checkpointStatuses(plan, entries), [plan, entries])
  const standing = useMemo(() => planStanding(plan, entries, today), [plan, entries, today])
  const reached = statuses.find((s) => s.checkpoint.goal)?.hit ?? null
  const week = cardioSessionsForWeek(plan, weekStartISO(today))

  // Reached wears the bright ring a reached strength goal does; a plan under way the committed green.
  const ring = reached
    ? 'ring-2 ring-accent-bright shadow-[0_0_16px_-4px_var(--color-accent-bright)]'
    : 'ring-1 ring-accent-2/60'

  return (
    <div className={`flex flex-col gap-3 rounded-2xl p-2 ${ring}`}>
      <h4 className="px-1 font-semibold">
        {goalLabel(plan.kind, plan.goal)}
        <span className="font-normal text-neutral-400">
          {reached ? ` · reached ${shortDate(reached)}` : ` · by ${shortDate(plan.targetDate)}`}
        </span>
      </h4>

      {standing && standing !== 'on' && !reached && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-surface px-3">
          <span className="text-sm text-neutral-300">{standing === 'behind' ? 'behind plan' : 'ahead of plan'}</span>
          <button
            onClick={() => onChange(replanCardio(plan, entries, today))}
            className="min-h-[44px] rounded-xl px-2 text-sm font-semibold text-accent active:opacity-80"
          >
            re-plan from here
          </button>
        </div>
      )}

      <PlanChart plan={plan} entries={entries} today={today} statuses={statuses} />

      {week.length > 0 && (
        <ul className="flex flex-col px-1">
          <li className="mb-1 text-xs tracking-wider text-neutral-500">this week</li>
          {week.map((s) => {
            const done = s.date <= today && plannedDone(plan, entries, s.date)
            return (
              <li key={s.date} className="flex min-h-[32px] items-center justify-between gap-2 text-sm">
                <span className={s.date === today ? 'text-neutral-100' : 'text-neutral-400'}>
                  <span className="inline-block w-9 text-neutral-500">{WEEKDAY_NAMES[weekdayOf(s.date)]}</span>
                  {s.label}
                </span>
                {done && <span className="text-accent-2">✓</span>}
              </li>
            )
          })}
        </ul>
      )}

      <ul className="flex flex-col px-1">
        <li className="mb-1 flex items-center justify-between">
          <span className="text-xs tracking-wider text-neutral-500">checkpoints</span>
          <button
            onClick={() => setEditing((e) => !e)}
            className="min-h-[36px] rounded-xl px-2 text-xs font-semibold text-accent active:opacity-80"
          >
            {editing ? 'done' : 'edit'}
          </button>
        </li>
        {statuses.map((s) => (
          <li key={s.checkpoint.id} className="flex min-h-[36px] items-center justify-between gap-2 text-sm">
            <span className={s.hit ? 'text-neutral-100' : 'text-neutral-400'}>
              <span className={`inline-block w-5 ${s.hit ? 'text-accent-2' : 'text-neutral-600'}`}>{s.hit ? '✓' : '○'}</span>
              {s.label}
              {s.checkpoint.goal ? <span className="text-neutral-500"> · goal</span> : null}
            </span>
            {editing && !s.checkpoint.goal ? (
              <button
                onClick={() => onChange(removeCheckpoint(plan, s.checkpoint.id))}
                className="min-h-[36px] rounded-xl px-2 text-sm text-neutral-500 active:opacity-80"
              >
                remove
              </button>
            ) : (
              <span className="shrink-0 text-xs text-neutral-500">
                {s.hit ? shortDate(s.hit) : s.due ? `by ${shortDate(s.due)}` : ''}
              </span>
            )}
          </li>
        ))}
        {editing && <AddCheckpoint plan={plan} onAdd={(c) => onChange(addCheckpoint(plan, c))} />}
      </ul>

      <div className="flex gap-2">
        <button
          onClick={onEdit}
          className="min-h-[44px] flex-1 rounded-xl bg-surface text-sm font-semibold text-neutral-300 active:opacity-80"
        >
          edit plan
        </button>
        <button
          onClick={() => {
            if (!confirmEnd) {
              setConfirmEnd(true)
              return
            }
            setConfirmEnd(false)
            onChange(endCardioPlan(plan, today))
          }}
          onBlur={() => setConfirmEnd(false)}
          className={`min-h-[44px] flex-1 rounded-xl bg-surface text-sm active:opacity-80 ${
            confirmEnd ? 'text-accent' : 'text-neutral-500'
          }`}
        >
          {confirmEnd ? 'tap again to end' : 'end plan'}
        </button>
      </div>
    </div>
  )
}

type AddKind = 'min' | 'mi' | 'time' | 'week'

const ADD_LABELS: Record<AddKind, string> = { min: 'min', mi: 'mi', time: 'time', week: 'week' }

/** A checkpoint of your own: a session this long, this far, this far this fast, or a week this big. */
function AddCheckpoint({ plan, onAdd }: { plan: CardioPlan; onAdd: (c: Omit<CardioCheckpoint, 'id' | 'goal'>) => void }) {
  const distanceGoal = plan.goal.type !== 'weekly'
  const kinds: AddKind[] = distanceGoal ? ['mi', 'time', 'min', 'week'] : ['week', 'min']
  const [kind, setKind] = useState<AddKind>(kinds[0])
  const [value, setValue] = useState('')
  const [clock, setClock] = useState('')
  const goalMi = plan.goal.type !== 'weekly' ? plan.goal.distanceMi : null

  const n = Number(value)
  const num = value.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null
  const t = parseClock(clock)
  const timeMi = num ?? goalMi
  const draft: Omit<CardioCheckpoint, 'id' | 'goal'> | null =
    kind === 'time'
      ? t && timeMi ? { distanceMi: timeMi, withinMin: t } : null
      : num == null
        ? null
        : kind === 'min'
          ? { minutes: Math.round(num) }
          : kind === 'mi'
            ? { distanceMi: num }
            : { weekMin: Math.round(num) }

  const add = () => {
    if (!draft) return
    onAdd(draft)
    setValue('')
    setClock('')
  }
  const addPress = usePressAction(add)
  const input =
    'min-h-[44px] w-full min-w-0 rounded-xl bg-surface-2 px-2 text-center text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-accent'

  return (
    <li className="mt-2 flex flex-col gap-2">
      <div className="flex gap-1">
        {kinds.map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`min-h-[36px] flex-1 rounded-full text-sm ${
              kind === k ? 'bg-accent text-on-accent' : 'bg-surface-2 text-neutral-300'
            }`}
          >
            {ADD_LABELS[k]}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={kind === 'time' && goalMi ? String(Math.round(goalMi * 100) / 100) : undefined}
          aria-label={kind === 'time' ? 'miles' : ADD_LABELS[kind]}
          className={input}
        />
        {kind === 'time' && (
          <input
            inputMode="numeric"
            placeholder="mm:ss"
            value={clock}
            onChange={(e) => setClock(e.target.value)}
            aria-label="time"
            className={input}
          />
        )}
        <button
          {...addPress}
          disabled={!draft}
          className="min-h-[44px] shrink-0 rounded-xl bg-accent px-4 font-semibold text-on-accent disabled:opacity-30"
        >
          add
        </button>
      </div>
    </li>
  )
}

function PlanChart({
  plan,
  entries,
  today,
  statuses,
}: {
  plan: CardioPlan
  entries: CardioEntry[]
  today: string
  statuses: CheckpointStatus[]
}) {
  const metric = chartMetric(plan)
  const rows = useMemo(
    () => planChartRows(plan, entries, today).map((r) => ({ ...r, t: parseISODate(r.week).getTime() })),
    [plan, entries, today],
  )
  const marks = statuses
    .map((s) => {
      const value = checkpointValue(s.checkpoint, plan)
      const date = s.hit ?? s.due
      return value != null && date ? { id: s.checkpoint.id, value, t: parseISODate(weekStartISO(date)).getTime(), hit: !!s.hit } : null
    })
    .filter((m): m is NonNullable<typeof m> => m != null)

  const scale = niceScale([
    ...rows.flatMap((r) => [r.planned, r.actual]).filter((v): v is number => v != null),
    metric.target,
    ...marks.map((m) => m.value),
    ...(metric.unit === 'time' ? [] : [0]),
  ])
  const fmt = (v: number) => (metric.unit === 'time' ? fmtClock(v) : metric.unit === 'mi' ? `${v} mi` : `${v} min`)
  const goalTag =
    metric.unit === 'time' ? `goal ${fmtClock(metric.target)}` : metric.unit === 'mi' ? `goal ${fmtDistance(metric.target)}` : `goal ${metric.target} min`

  return (
    <div className="rounded-2xl bg-surface p-2">
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={rows} margin={{ top: 8, right: 14, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={CHART_SURFACE_2} vertical={false} />
          <XAxis {...timeXAxis} tick={axisTick} tickFormatter={fmtTick} />
          <YAxis
            tick={axisTick}
            width={metric.unit === 'time' ? 48 : 40}
            domain={scale.domain}
            ticks={scale.ticks}
            reversed={metric.lowerIsBetter}
            tickFormatter={(v: number) => (metric.unit === 'time' ? fmtClock(v) : String(v))}
          />
          <Tooltip
            cursor={false}
            contentStyle={tooltipStyle}
            labelStyle={{ color: 'var(--color-neutral-400)' }}
            labelFormatter={(t) => `week of ${shortDate(toISODate(new Date(Number(t))))}`}
            formatter={(v, name) => [fmt(Number(v)), name]}
          />
          {goalLineMarks({ target: metric.target, label: goalTag, bg: CHART_SURFACE, size: 10 })}
          <Line
            type="monotone"
            dataKey="planned"
            name="plan"
            stroke={LINE_GOAL}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="done"
            stroke={LINE_PRIMARY}
            strokeWidth={2}
            dot={{ r: 3, fill: LINE_PRIMARY, stroke: LINE_PRIMARY }}
            connectNulls
            isAnimationActive={false}
          />
          {marks.map((m) => (
            <ReferenceDot
              key={m.id}
              x={m.t}
              y={m.value}
              r={5}
              fill={m.hit ? LINE_PRIMARY : CHART_SURFACE}
              stroke={m.hit ? LINE_PRIMARY : LINE_GOAL}
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
