import { afterEach, describe, expect, it } from 'vitest'
import type { CardioEntry } from './cardio'
import {
  actualLevel,
  addCheckpoint,
  autoCheckpoints,
  buildCardioPlan,
  cardioLevelFrom,
  cardioSessionsForWeek,
  checkpoint,
  checkpointCelebration,
  checkpointDueDate,
  checkpointHitDate,
  checkpointLabel,
  checkpointStatuses,
  defaultCardioDays,
  describeCardioPlan,
  earliestTargetDate,
  editCheckpoint,
  endCardioPlan,
  firstPlanWeek,
  fmtClock,
  fmtDistance,
  generateWeeks,
  goalLabel,
  goalTypesFor,
  LIGHTER_EVERY,
  liftingWeekdays,
  MI_10K,
  MI_5K,
  MI_HALF,
  newlyHitCheckpoints,
  parseClock,
  planActive,
  planChartRows,
  plannedMinutes,
  plannedOn,
  plannedSessionCount,
  planStanding,
  plusDays,
  RAMP,
  RAMP_FLOOR_LONG_MIN,
  RAMP_FLOOR_WEEK_MIN,
  removeCheckpoint,
  replanCardio,
  riegel,
  sessionMeets,
  snapDistance,
  startingCardioDays,
  startingLevel,
  suggestTargetDate,
  weekdayOf,
  weeksNeeded,
  type CardioGoal,
  type CardioLevel,
  type CardioPlan,
  type CardioPlanWeek,
} from './cardioPlan'
import type { Profile } from './profile'
import { setActiveCardioPlan, setActiveProfile } from './profileStore'
import { weeklyGoalsFor } from './weeklyStreak'

// Monday 2026-11-16.
const MON = '2026-11-16'
const TUE_DAYS = [1, 3, 5] // tue, thu, sat

const BEGINNER: CardioLevel = { longestMin: 10, longestMi: 0.8, weeklyMin: 20 }
const RUNNER: CardioLevel = { longestMin: 35, longestMi: 3.1, weeklyMin: 75, timeMin: 33 }
const FIVE_K: CardioGoal = { type: 'distance', distanceMi: MI_5K }
const FIVE_K_28: CardioGoal = { type: 'time', distanceMi: MI_5K, minutes: 28 }
const WEEKLY_150: CardioGoal = { type: 'weekly', minutes: 150 }

let nextId = 0
function entry(over: Partial<CardioEntry> & Pick<CardioEntry, 'date'>): CardioEntry {
  return { id: `e${nextId++}`, kind: 'run', minutes: 30, ...over }
}

function plan(goal: CardioGoal = FIVE_K, level: CardioLevel = BEGINNER, today = MON, days = TUE_DAYS, targetDate?: string): CardioPlan {
  const target = targetDate ?? suggestTargetDate('run', goal, level, days, today)
  return buildCardioPlan({ kind: 'run', goal, level, days, targetDate: target }, today, undefined, 'p1')
}

/** Each build or hold week against the last such week before it. */
function growthPairs(weeks: CardioPlanWeek[]): [CardioPlanWeek, CardioPlanWeek][] {
  const steady = weeks.filter((w) => w.phase === 'build' || w.phase === 'hold')
  return steady.slice(1).map((w, i) => [steady[i], w])
}

describe('formatting', () => {
  it('names the race distances and leaves the rest in miles', () => {
    expect(fmtDistance(MI_5K)).toBe('5k')
    expect(fmtDistance(3.1)).toBe('5k')
    expect(fmtDistance(MI_10K)).toBe('10k')
    expect(fmtDistance(MI_HALF)).toBe('half marathon')
    expect(fmtDistance(2.5)).toBe('2.5 mi')
  })

  it('writes and reads a clock', () => {
    expect(fmtClock(28)).toBe('28:00')
    expect(fmtClock(27.5)).toBe('27:30')
    expect(fmtClock(65.25)).toBe('1:05:15')
    expect(parseClock('28:00')).toBe(28)
    expect(parseClock('1:05:30')).toBe(65.5)
    expect(parseClock('31')).toBe(31)
    expect(parseClock('abc')).toBeNull()
    expect(parseClock('0:00')).toBeNull()
  })

  it('labels goals', () => {
    expect(goalLabel('run', FIVE_K)).toBe('run 5k')
    expect(goalLabel('run', FIVE_K_28)).toBe('run 5k in 28:00')
    expect(goalLabel('bike', { type: 'distance', distanceMi: 25 })).toBe('ride 25 mi')
    expect(goalLabel('run', WEEKLY_150)).toBe('150 min a week')
  })

  it('offers only a minutes goal for a kind with no distance', () => {
    expect(goalTypesFor('run')).toEqual(['distance', 'time', 'weekly'])
    expect(goalTypesFor('soccer')).toEqual(['weekly'])
  })

  it('labels checkpoints', () => {
    expect(checkpointLabel(checkpoint({ minutes: 20 }))).toBe('20 min without stopping')
    expect(checkpointLabel(checkpoint({ distanceMi: 2 }))).toBe('2 mi')
    expect(checkpointLabel(checkpoint({ distanceMi: MI_5K, withinMin: 31 }))).toBe('5k in 31:00')
    expect(checkpointLabel(checkpoint({ weekMin: 120 }))).toBe('120 min in a week')
  })
})

describe('days', () => {
  it('reads the weekday, Monday first', () => {
    expect(weekdayOf(MON)).toBe(0)
    expect(weekdayOf('2026-11-22')).toBe(6)
  })

  it('keeps clear of lifting days and off back-to-back days, with a weekend day', () => {
    const days = defaultCardioDays(3, [0, 2, 4])
    expect(days).toHaveLength(3)
    for (const d of days) expect([0, 2, 4]).not.toContain(d)
    expect(days.some((d) => d >= 5)).toBe(true)
  })

  it('spreads days with no lifting to work around', () => {
    const days = defaultCardioDays(3)
    for (const d of days) expect(days).not.toContain((d + 1) % 7)
  })

  it('doubles up on lifting days only when the week runs out of room', () => {
    const days = defaultCardioDays(5, [0, 2, 4])
    expect(days).toHaveLength(5)
    expect(days.filter((d) => [0, 2, 4].includes(d))).toHaveLength(1)
  })

  it('reads the lifting habit off the last six weeks', () => {
    const dates: string[] = []
    for (let w = 1; w <= 6; w++) {
      const monday = plusDays(MON, -7 * w)
      dates.push(monday) // every Monday
      if (w <= 2) dates.push(plusDays(monday, 3)) // Thursday only twice
    }
    expect(liftingWeekdays(dates, MON)).toEqual([0])
  })

  it('starts this week only when every chosen day is still ahead', () => {
    expect(firstPlanWeek([1, 3, 5], MON)).toBe(MON)
    expect(firstPlanWeek([1, 3, 5], '2026-11-17')).toBe(MON)
    expect(firstPlanWeek([1, 3, 5], '2026-11-18')).toBe('2026-11-23')
  })

  it("starts a new plan on the weekly cardio goal's count, three without one", () => {
    expect(startingCardioDays(2, [0, 2, 4])).toEqual(defaultCardioDays(2, [0, 2, 4]))
    expect(startingCardioDays(0)).toHaveLength(3)
    expect(startingCardioDays(9)).toHaveLength(6)
  })

  it('takes a target no earlier than the first plan week, nor today', () => {
    expect(earliestTargetDate([1, 3, 5], MON)).toBe(MON)
    expect(earliestTargetDate([0, 3, 5], '2026-11-18')).toBe('2026-11-23')
    expect(earliestTargetDate([], '2026-11-18')).toBe('2026-11-18')
  })
})

describe('starting points', () => {
  it("reads the log, else the plan's own start, else nothing", () => {
    const fromLog = startingLevel([entry({ date: '2026-11-10', minutes: 22, distanceMi: 2 })], 'run', FIVE_K, MON)
    expect(fromLog.longestMin).toBe(22)
    expect(startingLevel([], 'run', FIVE_K, MON, RUNNER)).toBe(RUNNER)
    expect(startingLevel([], 'run', FIVE_K, MON)).toEqual({ longestMin: 0, longestMi: 0, weeklyMin: 0 })
  })

  it('snaps a rounded race distance to the race', () => {
    expect(snapDistance(3.1)).toBe(MI_5K)
    expect(snapDistance(13.1)).toBe(MI_HALF)
    expect(snapDistance(4)).toBe(4)
  })
})

describe('generateWeeks', () => {
  it('runs one week per week from the first to the target date', () => {
    const weeks = generateWeeks({ kind: 'run', goal: FIVE_K, level: BEGINNER, days: TUE_DAYS, targetDate: '2027-01-30', firstWeek: MON })
    expect(weeks[0].start).toBe(MON)
    expect(weeks.at(-1)!.start).toBe('2027-01-25')
    weeks.forEach((w, i) => expect(w.start).toBe(plusDays(MON, 7 * i)))
  })

  it('puts sessions only on the chosen days', () => {
    for (const w of plan().weeks) for (const s of w.sessions) expect(TUE_DAYS).toContain(s.day)
  })

  it('starts from where you are', () => {
    const first = plan().weeks[0]
    const long = first.sessions.find((s) => s.type === 'long')!
    expect(long.minutes).toBe(10)
    expect(plannedMinutes(first)).toBeLessThanOrEqual(35)
  })

  it.each([
    ['a 5k from scratch', FIVE_K, BEGINNER],
    ['a faster 5k', FIVE_K_28, RUNNER],
    ['150 minutes a week', WEEKLY_150, BEGINNER],
    ['a half marathon', { type: 'distance', distanceMi: MI_HALF } as CardioGoal, { longestMin: 50, longestMi: 5, weeklyMin: 120 }],
  ])('ramps %s gently', (_name, goal, level) => {
    const weeks = plan(goal, level).weeks
    for (const [a, b] of growthPairs(weeks)) {
      const va = plannedMinutes(a)
      const vb = plannedMinutes(b)
      // Ten percent, or the floor off a small base, plus a minute a session of rounding.
      expect(vb).toBeLessThanOrEqual(Math.max(va * (1 + RAMP), va + RAMP_FLOOR_WEEK_MIN) + b.sessions.length)
      const la = Math.max(...a.sessions.map((s) => s.minutes))
      const lb = Math.max(...b.sessions.map((s) => s.minutes))
      expect(lb).toBeLessThanOrEqual(Math.max(la * (1 + RAMP), la + RAMP_FLOOR_LONG_MIN) + 1)
    }
  })

  it('makes every fourth week lighter than the one before it', () => {
    const weeks = plan().weeks
    for (let i = LIGHTER_EVERY - 1; i < weeks.length - 1; i += LIGHTER_EVERY) {
      if (weeks[i].phase === 'taper' || weeks[i].phase === 'goal') continue
      expect(weeks[i].phase).toBe('lighter')
      expect(plannedMinutes(weeks[i])).toBeLessThan(plannedMinutes(weeks[i - 1]))
    }
  })

  it('tapers into the goal session on the target date', () => {
    const p = plan()
    const last = p.weeks.at(-1)!
    expect(last.phase).toBe('goal')
    const goal = last.sessions.at(-1)!
    expect(goal.type).toBe('goal')
    expect(goal.distanceMi).toBe(MI_5K)
    expect(goal.label).toBe('goal: run 5k')
    expect(plusDays(last.start, goal.day)).toBe(p.targetDate)
    expect(plannedMinutes(last)).toBeLessThan(plannedMinutes(p.weeks.at(-2)!))
  })

  it('puts the goal session on a target date that is not one of the chosen days', () => {
    const weeks = generateWeeks({ kind: 'run', goal: FIVE_K, level: BEGINNER, days: TUE_DAYS, targetDate: '2027-01-31', firstWeek: MON })
    const goal = weeks.at(-1)!.sessions.at(-1)!
    expect(goal.type).toBe('goal')
    expect(goal.day).toBe(6)
  })

  it('tapers two weeks for a half marathon', () => {
    const weeks = plan({ type: 'distance', distanceMi: MI_HALF }, { longestMin: 50, longestMi: 5, weeklyMin: 120 }).weeks
    expect(weeks.at(-2)!.phase).toBe('taper')
    expect(weeks.at(-1)!.phase).toBe('goal')
    // The long session tops out short of the race.
    const longest = Math.max(...weeks.flatMap((w) => w.sessions.filter((s) => s.type === 'long').map((s) => s.distanceMi ?? 0)))
    expect(longest).toBeLessThan(MI_HALF)
    expect(longest).toBeGreaterThanOrEqual(10)
  })

  it('builds a minutes goal all the way, with no taper', () => {
    const weeks = plan(WEEKLY_150).weeks
    expect(weeks.some((w) => w.phase === 'taper' || w.phase === 'goal')).toBe(false)
    expect(plannedMinutes(weeks.at(-1)!)).toBeGreaterThanOrEqual(149)
  })

  it('holds once the goal volume is reached rather than climbing past it', () => {
    const weeks = plan(WEEKLY_150, BEGINNER, MON, TUE_DAYS, '2027-12-31').weeks
    const holds = weeks.filter((w) => w.phase === 'hold')
    expect(holds.length).toBeGreaterThan(10)
    for (const w of holds) expect(plannedMinutes(w)).toBeLessThanOrEqual(155)
  })

  it('works a time goal with tempo and interval sessions at goal pace', () => {
    const weeks = plan(FIVE_K_28, RUNNER).weeks
    const types = new Set(weeks.flatMap((w) => w.sessions.map((s) => s.type)))
    expect(types.has('tempo')).toBe(true)
    expect(types.has('intervals')).toBe(true)
    const tempo = weeks.flatMap((w) => w.sessions).find((s) => s.type === 'tempo')!
    expect(tempo.label).toMatch(/^tempo run \d+ min · 9:01\/mi$/)
  })

  it('calls a bike session a ride', () => {
    const p = buildCardioPlan({ kind: 'bike', goal: { type: 'distance', distanceMi: 25 }, level: { longestMin: 40, longestMi: 8, weeklyMin: 80 }, days: [2, 5], targetDate: '2027-03-01' }, MON)
    expect(p.weeks[0].sessions.map((s) => s.label)).toEqual(['easy ride 40 min', 'long ride 8 mi'])
  })

  it('gives a single-session week the whole volume', () => {
    const weeks = generateWeeks({ kind: 'run', goal: WEEKLY_150, level: BEGINNER, days: [5], targetDate: '2027-01-30', firstWeek: MON })
    for (const w of weeks) expect(w.sessions).toHaveLength(1)
  })
})

describe('suggestTargetDate', () => {
  it('lands on a chosen day', () => {
    const date = suggestTargetDate('run', FIVE_K, BEGINNER, TUE_DAYS, MON)
    expect(TUE_DAYS).toContain(weekdayOf(date))
  })

  it('asks for longer the further the goal is', () => {
    expect(weeksNeeded('run', FIVE_K, BEGINNER, 3)).toBeGreaterThan(weeksNeeded('run', FIVE_K, RUNNER, 3))
    expect(weeksNeeded('run', { type: 'distance', distanceMi: MI_10K }, BEGINNER, 3)).toBeGreaterThan(weeksNeeded('run', FIVE_K, BEGINNER, 3))
  })

  it('gives speed about one percent a week', () => {
    // 33:00 to 28:00 is fifteen percent.
    expect(weeksNeeded('run', FIVE_K_28, RUNNER, 3)).toBeGreaterThanOrEqual(16)
  })

  it('never suggests less than four weeks', () => {
    expect(weeksNeeded('run', FIVE_K, { longestMin: 40, longestMi: 4, weeklyMin: 120 }, 3)).toBe(4)
  })
})

describe('cardioSessionsForWeek', () => {
  it('is empty with no plan', () => {
    expect(cardioSessionsForWeek(undefined, MON)).toEqual([])
  })

  it('dates each session in the week', () => {
    const sessions = cardioSessionsForWeek(plan(), MON)
    expect(sessions.map((s) => s.date)).toEqual(['2026-11-17', '2026-11-19', '2026-11-21'])
    expect(sessions[0]).toEqual({ date: '2026-11-17', kind: 'run', minutes: 10, label: 'easy run 10 min' })
    expect(sessions[2].distanceMi).toBe(1)
  })

  it('reads a mid-week date as its week', () => {
    expect(cardioSessionsForWeek(plan(), '2026-11-19')).toEqual(cardioSessionsForWeek(plan(), MON))
  })

  it('is empty outside the plan', () => {
    expect(cardioSessionsForWeek(plan(), '2026-11-09')).toEqual([])
    expect(cardioSessionsForWeek(plan(), '2030-01-07')).toEqual([])
  })

  it('stops at the week a plan was ended, keeping the weeks before', () => {
    const ended = endCardioPlan(plan(), '2026-11-25')
    expect(cardioSessionsForWeek(ended, MON)).toHaveLength(3)
    expect(cardioSessionsForWeek(ended, '2026-11-23')).toEqual([])
    expect(planActive(ended, '2026-11-25')).toBe(false)
  })

  it('counts the days planned, and finds today', () => {
    expect(plannedSessionCount(plan(), MON)).toBe(3)
    expect(plannedSessionCount(plan(), '2026-11-09')).toBeNull()
    expect(plannedOn(plan(), '2026-11-19')?.label).toBe('easy run 10 min')
    expect(plannedOn(plan(), '2026-11-18')).toBeNull()
  })
})

describe('checkpoints', () => {
  it('starts a 5k plan with markers on the way and the goal last', () => {
    const p = plan()
    const labels = p.checkpoints.map(checkpointLabel)
    expect(labels).toEqual(['1.5 mi', '20 min without stopping', '2.5 mi', '5k'])
    expect(p.checkpoints.at(-1)!.goal).toBe(true)
  })

  it('starts a time plan with the distance, then the clock coming down', () => {
    const p = plan(FIVE_K_28, { ...RUNNER, longestMi: 2 })
    expect(p.checkpoints.map(checkpointLabel)).toEqual(['5k', '5k in 31:30', '5k in 30:00', '5k in 28:00'])
  })

  it('starts a minutes plan with bigger weeks', () => {
    expect(plan(WEEKLY_150, { ...BEGINNER, weeklyMin: 45 }).checkpoints.map(checkpointLabel)).toEqual([
      '80 min in a week',
      '110 min in a week',
      '150 min in a week',
    ])
  })

  it('only puts checkpoints ahead of where you are', () => {
    const cps = autoCheckpoints('run', FIVE_K, { longestMin: 25, longestMi: 2.6, weeklyMin: 60 }, plan(FIVE_K, { longestMin: 25, longestMi: 2.6, weeklyMin: 60 }).weeks)
    for (const c of cps) if (c.distanceMi) expect(c.distanceMi).toBeGreaterThan(2.6)
  })

  it('meets a distance, a time and a length the way a logged session would', () => {
    expect(sessionMeets(checkpoint({ distanceMi: MI_5K }), { minutes: 33, distanceMi: 3.1 })).toBe(true)
    expect(sessionMeets(checkpoint({ distanceMi: MI_5K }), { minutes: 33, distanceMi: 3 })).toBe(false)
    expect(sessionMeets(checkpoint({ distanceMi: MI_5K, withinMin: 28 }), { minutes: 27.9, distanceMi: 3.1 })).toBe(true)
    expect(sessionMeets(checkpoint({ distanceMi: MI_5K, withinMin: 28 }), { minutes: 29, distanceMi: 3.1 })).toBe(false)
    // A longer run at a pace that would have covered the 5k in time.
    expect(sessionMeets(checkpoint({ distanceMi: MI_5K, withinMin: 28 }), { minutes: 35, distanceMi: 4 })).toBe(true)
    expect(sessionMeets(checkpoint({ minutes: 20 }), { minutes: 20 })).toBe(true)
    expect(sessionMeets(checkpoint({ minutes: 20 }), { minutes: 19 })).toBe(false)
    expect(sessionMeets(checkpoint({ weekMin: 20 }), { minutes: 60 })).toBe(false)
  })

  it('dates a hit to the first counted session that meets it', () => {
    const p = plan()
    const cp = checkpoint({ distanceMi: 1.5 })
    const entries = [
      entry({ date: '2026-11-10', distanceMi: 3 }), // before the plan
      entry({ date: '2026-11-18', kind: 'bike', distanceMi: 10 }), // another kind
      entry({ date: '2026-11-21', distanceMi: 1.2 }),
      entry({ date: '2026-11-28', distanceMi: 1.6 }),
      entry({ date: '2026-12-05', distanceMi: 2 }),
    ]
    expect(checkpointHitDate(cp, p, entries)).toBe('2026-11-28')
  })

  it('counts any cardio toward a minutes-a-week checkpoint, summed over the week', () => {
    const p = plan(WEEKLY_150)
    const cp = checkpoint({ weekMin: 60 })
    const entries = [
      entry({ date: '2026-11-17', minutes: 30 }),
      entry({ date: '2026-11-24', minutes: 30 }),
      entry({ date: '2026-11-26', kind: 'bike', minutes: 35 }),
    ]
    expect(checkpointHitDate(cp, p, entries)).toBe('2026-11-26')
  })

  it('reports what a new session just hit, and cheers it', () => {
    const p = plan()
    const before = [entry({ date: '2026-11-21', minutes: 15, distanceMi: 1.2 })]
    const after = [...before, entry({ date: '2026-11-28', minutes: 22, distanceMi: 1.8 })]
    const hit = newlyHitCheckpoints(p, before, after)
    expect(hit.map(checkpointLabel)).toEqual(['1.5 mi', '20 min without stopping'])
    expect(checkpointCelebration(p, hit)).toMatchObject({ tier: 'large', title: 'checkpoints hit', subtitle: '1.5 mi · 20 min without stopping', icon: 'flag' })
    expect(checkpointCelebration(p, [])).toBeNull()
  })

  it('cheers the goal loudest', () => {
    const p = plan()
    const hit = newlyHitCheckpoints(p, [], [entry({ date: '2026-12-01', minutes: 34, distanceMi: 3.11 })])
    expect(hit.some((c) => c.goal)).toBe(true)
    expect(checkpointCelebration(p, hit)).toMatchObject({ tier: 'epic', icon: 'trophy', subtitle: 'run 5k' })
  })

  it('hits nothing on an ended plan', () => {
    const p = endCardioPlan(plan(), '2026-11-20')
    expect(newlyHitCheckpoints(p, [], [entry({ date: '2026-11-20', minutes: 40, distanceMi: 4 })])).toEqual([])
  })

  it('adds, edits and removes, but never the goal', () => {
    let p = plan()
    p = addCheckpoint(p, { distanceMi: 2 })
    expect(p.checkpoints.map(checkpointLabel)).toContain('2 mi')
    expect(addCheckpoint(p, { distanceMi: 2 })).toBe(p)
    p = editCheckpoint(p, 'dist:2', { distanceMi: 2.25 })
    expect(p.checkpoints.map(checkpointLabel)).toContain('2.25 mi')
    expect(p.checkpoints.map(checkpointLabel)).not.toContain('2 mi')
    p = removeCheckpoint(p, 'dist:2.3')
    expect(p.checkpoints.map(checkpointLabel)).not.toContain('2.25 mi')
    const goalId = p.checkpoints.find((c) => c.goal)!.id
    expect(removeCheckpoint(p, goalId).checkpoints).toHaveLength(p.checkpoints.length)
    expect(editCheckpoint(p, goalId, { distanceMi: 1 })).toBe(p)
    // The goal stays last whatever is added.
    expect(addCheckpoint(p, { distanceMi: 5 }).checkpoints.at(-1)!.goal).toBe(true)
  })

  it('dates each checkpoint off the plan, in order', () => {
    const p = plan()
    const statuses = checkpointStatuses(p, [])
    const dues = statuses.map((s) => s.due!)
    expect(dues.every(Boolean)).toBe(true)
    expect([...dues].sort()).toEqual(dues)
    expect(dues.at(-1)).toBe(p.targetDate)
    expect(statuses.every((s) => s.hit === null)).toBe(true)
  })

  it('dates a time checkpoint along the line from where you were to the goal', () => {
    const p = plan(FIVE_K_28, RUNNER)
    const due = checkpointDueDate(checkpoint({ distanceMi: MI_5K, withinMin: 30.5 }), p)!
    expect(due > p.startDate && due < p.targetDate).toBe(true)
  })
})

describe('re-planning', () => {
  const p = plan(FIVE_K, BEGINNER)
  // Two weeks in, on the Monday of week three.
  const today = '2026-11-30'

  it('keeps the weeks behind exactly as they were', () => {
    const again = replanCardio(p, [entry({ date: '2026-11-21', minutes: 12, distanceMi: 1 })], today)
    expect(again.weeks.slice(0, 2)).toEqual(p.weeks.slice(0, 2))
    expect(again.weeks[2].start).toBe(today)
    expect(again.weeks.at(-1)!.start).toBe(p.weeks.at(-1)!.start)
    expect(again.replannedAt).toBe(today)
    expect(again.checkpoints).toEqual(p.checkpoints)
  })

  it('starts lower after falling behind', () => {
    const again = replanCardio(p, [entry({ date: '2026-11-17', minutes: 8, distanceMi: 0.6 })], today)
    expect(plannedMinutes(again.weeks[2])).toBeLessThan(plannedMinutes(p.weeks[2]))
  })

  it('starts higher after getting ahead', () => {
    const entries = [
      entry({ date: '2026-11-24', minutes: 25 }),
      entry({ date: '2026-11-26', minutes: 25 }),
      entry({ date: '2026-11-28', minutes: 30, distanceMi: 2.8 }),
    ]
    const again = replanCardio(p, entries, today)
    expect(plannedMinutes(again.weeks[2])).toBeGreaterThan(plannedMinutes(p.weeks[2]))
    expect(Math.max(...again.weeks[2].sessions.map((s) => s.minutes))).toBeGreaterThan(Math.max(...p.weeks[2].sessions.map((s) => s.minutes)))
  })

  it('reads where you are off the log since the plan began', () => {
    const level = actualLevel(p, [entry({ date: '2026-11-10', minutes: 90 }), entry({ date: '2026-11-21', minutes: 14, distanceMi: 1.3 })], today)
    expect(level.longestMin).toBe(14)
    expect(level.longestMi).toBe(1.3)
    expect(level.weeklyMin).toBe(14)
  })

  it('leaves a plan whose date has gone', () => {
    expect(replanCardio(p, [], '2027-06-01')).toBe(p)
  })

  it('judges last week against its plan', () => {
    const week2 = p.weeks[1]
    const done = (scale: number, count = week2.sessions.length) =>
      week2.sessions.slice(0, count).map((s) => entry({ date: plusDays(week2.start, s.day), minutes: Math.round(s.minutes * scale) }))
    expect(planStanding(p, done(1), today)).toBe('on')
    expect(planStanding(p, done(1, 1), today)).toBe('behind')
    expect(planStanding(p, done(0.5), today)).toBe('behind')
    expect(planStanding(p, done(1.5), today)).toBe('ahead')
    // Nothing to judge in the first week, nor right after a re-plan.
    expect(planStanding(p, [], MON)).toBeNull()
    expect(planStanding({ ...p, replannedAt: today }, [], today)).toBeNull()
  })

  it('keeps the lived weeks of a plan it replaces', () => {
    const next = buildCardioPlan({ kind: 'run', goal: FIVE_K_28, level: RUNNER, days: [0, 3], targetDate: '2027-04-30' }, '2026-11-26', p)
    expect(next.weeks.slice(0, 2)).toEqual(p.weeks.slice(0, 2))
    expect(next.startDate).toBe('2026-11-30')
    expect(next.createdAt).toBe('2026-11-26')
    // The current week, already part-lived, is kept from the old plan too.
    expect(next.weeks[1].start).toBe('2026-11-23')
    expect(next.checkpoints.at(-1)!.withinMin).toBe(28)
  })

  it('keeps the checkpoints and start of a plan edited with the same goal', () => {
    const edited = buildCardioPlan({ kind: 'run', goal: FIVE_K, level: BEGINNER, days: [2, 6], targetDate: p.targetDate }, '2026-11-26', addCheckpoint(p, { distanceMi: 2 }))
    expect(edited.id).toBe(p.id)
    expect(edited.startDate).toBe(p.startDate)
    expect(edited.checkpoints.map(checkpointLabel)).toContain('2 mi')
    expect(cardioSessionsForWeek(edited, '2026-11-30').map((s) => weekdayOf(s.date))).toEqual([2, 6])
  })
})

describe('cardioLevelFrom', () => {
  it('is null with nothing logged', () => {
    expect(cardioLevelFrom([], 'run', FIVE_K, MON)).toBeNull()
  })

  it('reads the longest, the weekly minutes, the pace and the time for the distance', () => {
    const entries = [
      entry({ date: '2026-11-03', minutes: 30, distanceMi: 3 }),
      entry({ date: '2026-11-05', minutes: 20, distanceMi: 2 }),
      entry({ date: '2026-11-10', minutes: 40, distanceMi: 3.6 }),
      entry({ date: '2026-11-12', minutes: 30, kind: 'bike' }),
    ]
    const level = cardioLevelFrom(entries, 'run', FIVE_K_28, MON)!
    expect(level.longestMin).toBe(40)
    expect(level.longestMi).toBe(3.6)
    // Two complete weeks of runs: 50 and 40.
    expect(level.weeklyMin).toBe(45)
    expect(level.paceMinPerMi).toBe(10)
    expect(level.timeMin).toBeCloseTo(riegel(30, 3, MI_5K), 1)
  })

  it('counts every kind toward a minutes-a-week level', () => {
    const entries = [entry({ date: '2026-11-10', minutes: 30 }), entry({ date: '2026-11-12', minutes: 30, kind: 'bike' })]
    expect(cardioLevelFrom(entries, 'run', WEEKLY_150, MON)!.weeklyMin).toBe(60)
  })
})

describe('planChartRows', () => {
  it('pairs each week planned with what was done, nothing for weeks ahead', () => {
    const p = plan()
    const rows = planChartRows(p, [entry({ date: '2026-11-21', minutes: 12, distanceMi: 1.1 })], '2026-11-25')
    expect(rows).toHaveLength(p.weeks.length)
    expect(rows[0]).toEqual({ week: MON, planned: 1, actual: 1.1 })
    expect(rows[1].actual).toBeUndefined()
    expect(rows.at(-1)!.planned).toBeCloseTo(MI_5K, 1)
  })

  it('plots a time goal as the time coming down', () => {
    const p = plan(FIVE_K_28, RUNNER)
    const rows = planChartRows(p, [entry({ date: '2026-11-21', minutes: 31, distanceMi: 3.1 })], '2026-11-22')
    expect(rows[0].planned).toBe(33)
    expect(rows.at(-1)!.planned).toBe(28)
    expect(rows[0].actual).toBeCloseTo(31, 0)
  })

  it('plots a minutes goal as the week total', () => {
    const p = plan(WEEKLY_150)
    const rows = planChartRows(p, [entry({ date: '2026-11-17', minutes: 20 }), entry({ date: '2026-11-19', minutes: 25, kind: 'swim' })], '2026-11-20')
    expect(rows[0]).toEqual({ week: MON, planned: plannedMinutes(p.weeks[0]), actual: 45 })
  })
})

describe('describeCardioPlan', () => {
  it('tells the coach the goal, the weeks and the checkpoints', () => {
    const p = plan()
    const lines = describeCardioPlan(p, [entry({ date: '2026-11-17', minutes: 10 })], '2026-11-18')
    expect(lines[0]).toBe(`Goal: run 5k by ${p.targetDate} (plan started ${MON}, on tue/thu/sat)`)
    expect(lines.find((l) => l.startsWith('This week:'))).toContain('tue easy run 10 min (done)')
    expect(lines.find((l) => l.startsWith('Next week:'))).toBeTruthy()
    expect(lines.at(-1)).toMatch(/^Checkpoints: 1\.5 mi — due \d{4}-\d\d-\d\d; /)
  })
})

describe('the weekly cardio goal follows the plan', () => {
  afterEach(() => {
    setActiveProfile(null)
    setActiveCardioPlan(undefined)
  })
  const profile = (cardio: number): Profile => ({
    name: 'Test',
    pillars: ['strength', 'cardio'],
    weeklyGoals: [{ from: '0000-01-01', goals: { workouts: 3, flex: 0, calDays: 0, cardio } }],
    calorieGoals: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  })
  const twoDay = () => plan(FIVE_K, BEGINNER, MON, [2, 6])

  it("holds a planned week to the plan's sessions", () => {
    setActiveProfile(profile(3))
    setActiveCardioPlan(twoDay())
    expect(weeklyGoalsFor(MON).cardio).toBe(2)
    expect(weeklyGoalsFor(MON).workouts).toBe(3)
  })

  it('leaves the goal alone outside the plan, and with no plan', () => {
    setActiveProfile(profile(3))
    setActiveCardioPlan(twoDay())
    expect(weeklyGoalsFor('2026-11-09').cardio).toBe(3)
    setActiveCardioPlan(undefined)
    expect(weeklyGoalsFor(MON).cardio).toBe(3)
  })

  it('stays out of a week cardio was not being tracked', () => {
    setActiveProfile(profile(0))
    setActiveCardioPlan(twoDay())
    expect(weeklyGoalsFor(MON).cardio).toBe(0)
    setActiveProfile(null)
    expect(weeklyGoalsFor(MON).cardio ?? 0).toBe(0)
  })

  it('goes back to the flat goal from the week a plan is ended', () => {
    setActiveProfile(profile(3))
    setActiveCardioPlan(endCardioPlan(twoDay(), '2026-11-24'))
    expect(weeklyGoalsFor(MON).cardio).toBe(2)
    expect(weeklyGoalsFor('2026-11-23').cardio).toBe(3)
  })
})
