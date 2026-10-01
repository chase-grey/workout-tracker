import { useEffect, useId, useMemo, useState } from 'react'
import {
  MdAcUnit,
  MdCelebration,
  MdCheckCircle,
  MdEmojiEvents,
  MdExpandMore,
  MdLocalFireDepartment,
  MdStar,
} from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { weeklySummary, weeklyWeightGains } from '../../lib/summary'
import { parseISODate } from '../../lib/dates'
import { caloriePR } from '../../lib/calories'
import { buildGoals, goalsHitInWeek } from '../../lib/goals'
import { weekPace, type MetricPace } from '../../lib/weekPace'
import { checkpointFraction, overallProgress } from '../../lib/celebration'
import { StreakHistoryPanel } from './StreakHistoryPanel'
import { Collapse } from '../../components/Collapse'

/**
 * One metric's row: the fill is what's done, and the pale line is where the
 * week's schedule expects it by now (see lib/weekPace). Being behind that line is
 * left for the line to show — the numbers and the marker keep one colour, since
 * what's still owed this week is plain enough from the counts.
 *
 * A metric that's met keeps its full bar and drops only the marker: the filled
 * track is the week's work made visible, and it's the thing worth seeing once the
 * goal lands — a marker pinned to the end is what said nothing the check beside
 * the numbers doesn't.
 */
function MetricBar({ label, m }: { label: string; m: Pick<MetricPace, 'done' | 'goal' | 'met' | 'required'> }) {
  const over = m.done > m.goal
  const pct = Math.min(m.done / m.goal, 1) * 100
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-neutral-300">{label}</span>
        <span className="tabular-nums text-neutral-400">
          {m.done}/{m.goal}{' '}
          {over ? (
            <MdStar className="inline align-text-bottom text-accent-2" aria-hidden />
          ) : m.met ? (
            <MdCheckCircle className="inline align-text-bottom text-accent-2" aria-hidden />
          ) : null}
        </span>
      </div>
      {/* Nothing is clipped here: the schedule line stands taller than the track
          it marks, the way the week bar's above does, and at either end it
          straddles the edge rather than being tucked inside it. */}
      <div className="relative h-2 rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        {!m.met && (
          <div
            className="absolute -top-0.5 h-3 w-0.5 -translate-x-1/2 rounded bg-white/70"
            style={{ left: `${Math.min(m.required / m.goal, 1) * 100}%` }}
          />
        )}
      </div>
    </div>
  )
}

export function ThisWeek({ onSelectWeek }: { onSelectWeek: (week: string) => void }) {
  const { weekProgress: wp, goals, streaks, streakHistory, workouts, bodyWeights, flexEntries, calorieEntries, measurements, settings } =
    useData()

  // The weeks behind the flame drop open right under it rather than living in a
  // panel down the Progress tab: the streak is read here, so that's where it
  // explains itself.
  const [showStreak, setShowStreak] = useState(false)
  const streakId = useId()
  const [showWeightHistory, setShowWeightHistory] = useState(false)
  const weightHistoryId = useId()

  const summary = weeklySummary(workouts, bodyWeights, new Date(), flexEntries.map((f) => f.date))
  const weightGains = weeklyWeightGains(bodyWeights)
  const calPR = caloriePR(calorieEntries)
  const hasPRs = summary.prs.length > 0 || calPR != null

  // The long-run goals that landed this week, above the week's PRs: a goal
  // reached is the bigger of the two, and it would otherwise show up nowhere but
  // the Goals panel, on whichever row had quietly turned over.
  const heightIn = settings.heightIn ?? 0
  const goalsHit = useMemo(
    () => goalsHitInWeek(buildGoals({ workouts, bodyWeights, measurements, heightIn, flexEntries })),
    [workouts, bodyWeights, measurements, heightIn, flexEntries],
  )

  // Read from the same two functions the cheers are judged by, rather than
  // recomputed here: the bar and the celebration that fires when it fills have to
  // agree about what "the week" averages, and a fourth metric added to one and
  // not the other is exactly how they'd drift.
  const overallToGoal = overallProgress(wp, goals)
  const checkpointFrac = checkpointFraction(goals)

  // Refresh while open and immediately after returning from a suspended tab.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const refresh = () => setNow(new Date())
    const timer = window.setInterval(refresh, 60_000)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])
  const pace = weekPace(wp, goals, now)
  const byKey = new Map(pace.metrics.map((m) => [m.key, m]))

  return (
    <div className="rounded-2xl bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-500">this week</h2>
        <button
          onClick={() => setShowStreak((v) => !v)}
          disabled={streakHistory.length === 0}
          aria-expanded={showStreak}
          aria-controls={streakId}
          aria-label="completed weeks"
          className="-m-2 flex items-center gap-3 p-2 text-sm font-semibold active:opacity-70"
        >
          <span className="flex items-center gap-1 text-accent">
            <MdLocalFireDepartment aria-hidden /> {streaks.streak}
          </span>
          <span className="flex items-center gap-1 text-neutral-300">
            <MdAcUnit aria-hidden /> {streaks.freezes}
          </span>
        </button>
      </div>

      <Collapse id={streakId} open={showStreak}>
        <StreakHistoryPanel
          onSelectWeek={(week) => {
            onSelectWeek(week)
            setShowStreak(false)
          }}
        />
      </Collapse>

      {/* Milestone bar: fill = progress; white line = where the schedule expects you; the grey and
          green ticks are the checkpoint and the goal, unlabelled — the two marks read on their own. */}
      <div className="relative h-3 rounded-full bg-surface-2">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-all"
          style={{ width: `${overallToGoal * 100}%` }}
        />
        <div className="absolute inset-y-0 w-0.5 bg-neutral-500" style={{ left: `${checkpointFrac * 100}%` }} />
        <div className="absolute inset-y-0 right-0 w-0.5 bg-accent-2" />
        {pace.requiredFraction < 1 && (
          <div
            className="absolute -top-0.5 h-4 w-0.5 -translate-x-1/2 rounded bg-white"
            style={{ left: `${pace.requiredFraction * 100}%` }}
            title="steady pace to finish the week"
          />
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <MetricBar label="workouts" m={byKey.get('workouts')!} />
        <MetricBar label="flex sessions" m={byKey.get('flex')!} />
        <MetricBar label="calorie days" m={byKey.get('calDays')!} />
      </div>

      {summary.weightTrend !== null && (
        <div className="mt-2 text-sm text-neutral-400">
          <button
            type="button"
            onClick={() => setShowWeightHistory((v) => !v)}
            aria-expanded={showWeightHistory}
            aria-controls={weightHistoryId}
            className="flex min-h-11 w-full items-center gap-1 text-left active:opacity-70"
          >
          weight{' '}
          <span className="font-semibold tabular-nums text-accent">
            {summary.weightTrend > 0 ? '+' : ''}
            {summary.weightTrend}
          </span>{' '}
          lbs this week
            <MdExpandMore
              aria-hidden
              className={`ml-auto text-lg transition-transform motion-reduce:transition-none ${showWeightHistory ? 'rotate-180' : ''}`}
            />
          </button>
          <Collapse id={weightHistoryId} open={showWeightHistory}>
            <div className="mt-1 rounded-xl bg-surface-2 p-3">
              <p className="font-medium text-neutral-300">previous weeks with weight gains</p>
              <p className="mt-1 text-xs text-neutral-500">
                Last weigh-in of each week compared with the last weigh-in before it.
              </p>
              {weightGains.length === 0 ? (
                <p className="mt-3">No previous weeks with weight gains yet.</p>
              ) : (
                <ul className="mt-3 max-h-64 space-y-3 overflow-y-auto">
                  {weightGains.map(({ week, gainLbs }) => (
                    <li key={week} className="flex items-center justify-between gap-3">
                      <span>week of {parseISODate(week).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-accent">+{gainLbs} lbs</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Collapse>
        </div>
      )}

      {goalsHit.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {goalsHit.map(({ goal }) => (
            <li key={goal.id} className="font-medium text-accent-bright">
              <MdCelebration className="inline align-text-bottom mr-1" aria-hidden />
              {goal.title} — goal reached!
            </li>
          ))}
        </ul>
      )}

      {hasPRs && (
        <ul className="mt-2 space-y-1 text-sm">
          {summary.prs.map((pr) => (
            <li key={pr.exercise} className="text-accent-2">
              <MdEmojiEvents className="inline align-text-bottom mr-1" aria-hidden />
              {pr.exercise} — {pr.weightLbs} lbs × {pr.reps}
            </li>
          ))}
          {calPR && (
            <li className="text-accent-2">
              <MdEmojiEvents className="inline align-text-bottom mr-1" aria-hidden />
              calories — {calPR.calories} cal (best bulk day!)
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
