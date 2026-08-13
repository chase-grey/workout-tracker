import { describe, it, expect } from 'vitest'
import {
  BENCH_GAIN_CAP,
  BODYWEIGHT_GAIN_CAP,
  buildGoals,
  FLEX_GAIN_DECAY,
  GOAL_IDS,
  type GoalSpec,
  goalsHitInWeek,
  isReached,
  projectGoal,
  PULLUP_GAIN_CAP,
  PULLUP_GOAL_REPS,
  PULLUP_GOAL_SETS,
  PULLUP_KEY,
  reachedDate,
  SQUAT_GAIN_CAP,
  STRENGTH_GAIN_DECAY,
} from './goals'
import { SPLIT_GOALS, TAILORS_GOALS } from './flexPredict'
import type { FlexEntry } from './flex'
import type { WorkoutRow } from '../types'
import { isPaceCapped, project } from './predictions'

/** A fortnight of weigh-ins climbing 3 lbs a week — a good run, plus water. */
const HOT_FORTNIGHT = [
  { date: '2026-01-31', weightLbs: 164 },
  { date: '2026-02-07', weightLbs: 167 },
  { date: '2026-02-14', weightLbs: 170 },
]

const inputs = (bodyWeights: typeof HOT_FORTNIGHT) => ({
  workouts: [],
  bodyWeights,
  measurements: [],
  heightIn: 70,
})

describe('bodyweight goals cap the pace they project against', () => {
  const goals = buildGoals(inputs(HOT_FORTNIGHT))
  const bodyweightGoals = goals.filter(
    (g) => g.id === GOAL_IDS.weight180 || g.id === GOAL_IDS.weight190,
  )

  it('caps both of them at a pound a week', () => {
    expect(bodyweightGoals).toHaveLength(2)
    for (const g of bodyweightGoals) expect(g.capPerWeek).toBe(BODYWEIGHT_GAIN_CAP)
  })

  it('projects 180 ten weeks out, not three', () => {
    const g = goals.find((x) => x.id === GOAL_IDS.weight180)!
    const p = project(g.points, g.target, new Date(2026, 1, 14), { capPerWeek: g.capPerWeek })

    expect(p.observedSlopePerWeek).toBe(3)
    expect(p.slopePerWeek).toBe(1)
    expect(p.etaWeeks).toBe(10)
  })

  it('caps the lift goals too — the taper alone scales with the fit', () => {
    for (const g of goals.filter((x) => x.exerciseKey != null)) {
      expect(g.capPerWeek).toBeDefined()
    }
  })
})

describe('lift goals cap the pace they project against', () => {
  /** One top set of five, a week apart, climbing 20 lbs a session. */
  const squatSet = (date: string, weight: number): WorkoutRow => ({
    session_id: date,
    date,
    day_type: 'fullbody',
    exercise: 'barbell_squat',
    set_number: 1,
    weight_lbs: weight,
    reps: 5,
    notes: '',
    is_historical: false,
  })
  const HOT_SQUATS = [
    squatSet('2026-02-01', 155),
    squatSet('2026-02-08', 175),
    squatSet('2026-02-15', 195),
  ]

  const goals = buildGoals({ ...inputs(HOT_FORTNIGHT), workouts: HOT_SQUATS })
  const today = new Date(2026, 1, 15)

  it('caps squat harder than bench, in line with what each adds', () => {
    expect(goals.find((g) => g.id === GOAL_IDS.squatBodyweight)!.capPerWeek).toBe(SQUAT_GAIN_CAP)
    expect(goals.find((g) => g.id === GOAL_IDS.squatOneAndAHalf)!.capPerWeek).toBe(SQUAT_GAIN_CAP)
    expect(goals.find((g) => g.id === GOAL_IDS.benchBodyweight)!.capPerWeek).toBe(BENCH_GAIN_CAP)
  })

  it('projects 1.5× bodyweight weeks out, not days', () => {
    // Three sessions of +20 lbs fit 23 lbs of estimated 1RM a week. Tapered but
    // uncapped, that reads as arriving inside a fortnight; held to five a week,
    // the same climb takes a couple of months.
    const g = goals.find((x) => x.id === GOAL_IDS.squatOneAndAHalf)!
    const uncapped = project(g.points, g.target, today, { decayPerWeek: g.decayPerWeek })
    const capped = project(g.points, g.target, today, {
      decayPerWeek: g.decayPerWeek,
      capPerWeek: g.capPerWeek,
    })

    expect(capped.observedSlopePerWeek).toBeCloseTo(23.35, 2)
    expect(capped.slopePerWeek).toBe(SQUAT_GAIN_CAP)
    expect(uncapped.etaWeeks).toBeLessThan(2)
    expect(capped.etaWeeks).toBeGreaterThan(6)
  })

  it('reports the pace as capped so the panel can say so', () => {
    const g = goals.find((x) => x.id === GOAL_IDS.squatOneAndAHalf)!
    const p = project(g.points, g.target, today, {
      decayPerWeek: g.decayPerWeek,
      capPerWeek: g.capPerWeek,
    })
    expect(isPaceCapped(p)).toBe(true)
  })
})

describe('the pull-up ladder', () => {
  /** One session of `reps.length` pull-up sets. */
  const pullups = (date: string, reps: number[]): WorkoutRow[] =>
    reps.map((n, i) => ({
      session_id: date,
      date,
      day_type: 'pull' as const,
      exercise: PULLUP_KEY,
      set_number: i + 1,
      weight_lbs: null,
      reps: n,
      notes: '',
      is_historical: false,
    }))

  const ladder = (workouts: WorkoutRow[]) =>
    buildGoals({ ...inputs(HOT_FORTNIGHT), workouts }).filter((g) =>
      g.id.startsWith(`pullups_${PULLUP_GOAL_SETS}x`),
    )

  it('lists a rung per rep target, ascending', () => {
    expect(ladder([]).map((g) => g.target)).toEqual([...PULLUP_GOAL_REPS])
    expect(ladder([]).map((g) => g.title)).toEqual([
      '4×5 pull-ups',
      '4×10 pull-ups',
      '4×15 pull-ups',
      '4×20 pull-ups',
    ])
  })

  it('measures a rung on the reps every one of the four sets made', () => {
    // Twelve on the first set doesn't make it a 4×12 day — the fourth set had 7.
    const goals = ladder(pullups('2026-02-01', [12, 10, 9, 7]))
    expect(goals[0].points).toEqual([{ date: '2026-02-01', value: 7 }])
    expect(isReached(goals[0])).toBe(true) // 4×5
    expect(isReached(goals[1])).toBe(false) // 4×10
  })

  it('ignores a session that stopped short of four sets', () => {
    expect(ladder(pullups('2026-02-01', [20, 20, 20]))[0].points).toEqual([])
  })

  it('counts a rung done with added weight', () => {
    const weighted = pullups('2026-02-01', [10, 10, 10, 10]).map((r) => ({ ...r, weight_lbs: 45 }))
    expect(isReached(ladder(weighted)[1])).toBe(true)
  })

  it('keeps a cleared rung cleared after a tired session', () => {
    const goals = ladder([...pullups('2026-02-01', [10, 10, 10, 10]), ...pullups('2026-02-08', [8, 7, 6, 6])])
    expect(isReached(goals[1])).toBe(true)
    expect(reachedDate(goals[1])).toBe('2026-02-01')
  })

  it('caps the pace at a rep a week, so a hot pair of sessions is not a ladder', () => {
    // 6 → 9 → 12 across a fortnight fits three reps a week; straight off that,
    // 4×20 lands inside a couple of months.
    const hot = [
      ...pullups('2026-02-01', [6, 6, 6, 6]),
      ...pullups('2026-02-08', [9, 9, 9, 9]),
      ...pullups('2026-02-15', [12, 12, 12, 12]),
    ]
    const twenty = ladder(hot).find((g) => g.target === 20)!
    expect(twenty.capPerWeek).toBe(PULLUP_GAIN_CAP)
    expect(twenty.decayPerWeek).toBe(STRENGTH_GAIN_DECAY)

    const p = projectGoal(twenty, new Date(2026, 1, 15))
    expect(p.observedSlopePerWeek).toBe(3)
    expect(p.slopePerWeek).toBe(PULLUP_GAIN_CAP)
    expect(isPaceCapped(p)).toBe(true)
    expect(p.etaWeeks).toBeGreaterThan(8)
  })
})

describe('flexibility goals join the goal set', () => {
  /** Improving split (70→100) and improving tailor's (60→80) across four sessions. */
  const flexEntries: FlexEntry[] = [
    { date: '2026-01-01', splitDeg: 70, tailorsLeftDeg: 58, tailorsRightDeg: 62 },
    { date: '2026-01-08', splitDeg: 80, tailorsLeftDeg: 63, tailorsRightDeg: 67 },
    { date: '2026-01-15', splitDeg: 90, tailorsLeftDeg: 68, tailorsRightDeg: 72 },
    { date: '2026-01-22', splitDeg: 100, tailorsLeftDeg: 78, tailorsRightDeg: 82 },
  ]
  const goals = buildGoals({ ...inputs(HOT_FORTNIGHT), flexEntries })

  it('adds one milestone goal per split and per tailors angle', () => {
    for (const deg of SPLIT_GOALS) {
      const g = goals.find((x) => x.id === `split_${deg}`)!
      expect(g).toBeDefined()
      expect(g.title).toBe(`${deg}° split`)
      expect(g.unit).toBe('°')
      expect(g.exerciseKey).toBeNull()
      expect(g.milestone).toBe(true)
    }
    for (const deg of TAILORS_GOALS) {
      const g = goals.find((x) => x.id === `tailors_${deg}`)!
      expect(g).toBeDefined()
      expect(g.title).toBe(`${deg}° tailor's pose`)
      expect(g.milestone).toBe(true)
    }
  })

  it('tapers every ladder rung', () => {
    for (const deg of SPLIT_GOALS) {
      expect(goals.find((x) => x.id === `split_${deg}`)!.decayPerWeek).toBe(FLEX_GAIN_DECAY)
    }
    for (const deg of TAILORS_GOALS) {
      expect(goals.find((x) => x.id === `tailors_${deg}`)!.decayPerWeek).toBe(FLEX_GAIN_DECAY)
    }
  })

  it('projects an improving split on track toward a far goal', () => {
    const g = goals.find((x) => x.id === 'split_180')!
    const p = project(g.points, g.target, new Date(2026, 0, 22), { decayPerWeek: g.decayPerWeek })
    expect(p.onTrack).toBe(true)
    expect(p.etaDate! > '2026-01-22').toBe(true)
  })

  it('holds the far rung back well past where a straight line would put it', () => {
    // 10°/week off the recent window, 80° short of a full split: drawn straight
    // that's eight weeks away. Tapering, the same pace takes twice as long.
    const g = goals.find((x) => x.id === 'split_180')!
    const straight = project(g.points, g.target, new Date(2026, 0, 22))
    const tapered = project(g.points, g.target, new Date(2026, 0, 22), {
      decayPerWeek: g.decayPerWeek,
    })

    expect(straight.etaWeeks).toBeCloseTo(8, 5)
    expect(tapered.etaWeeks).toBeGreaterThan(15)
  })

  it('dates the far rungs a modest pace only reaches years out', () => {
    // 1.5°/week from 110°: the taper (see FLEX_GAIN_DECAY) buys 12° of that on
    // its own and the floor grinds out the rest. 120 lands inside the taper, 150
    // is a couple of years of this, 180 twice that again — each a date, because
    // "a long way off" is what the rung should say, not a blank.
    const creeping: FlexEntry[] = [
      { date: '2026-01-08', splitDeg: 107, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-01-15', splitDeg: 108.5, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-01-22', splitDeg: 110, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    const slow = buildGoals({ ...inputs(HOT_FORTNIGHT), flexEntries: creeping })
    const at = (id: string) => {
      const g = slow.find((x) => x.id === id)!
      return project(g.points, g.target, new Date(2026, 0, 22), { decayPerWeek: g.decayPerWeek })
    }

    expect(at('split_120').etaWeeks!).toBeLessThan(16)
    expect(at('split_150').etaWeeks!).toBeGreaterThan(52 * 1.5)
    expect(at('split_180').etaWeeks!).toBeGreaterThan(at('split_150').etaWeeks!)
    for (const id of ['split_120', 'split_150', 'split_180']) {
      expect(at(id).onTrack).toBe(true)
      expect(at(id).etaDate).not.toBeNull()
    }
  })

  it('lists the flex goals with empty series when no entries are given', () => {
    const bare = buildGoals(inputs(HOT_FORTNIGHT))
    for (const deg of SPLIT_GOALS) {
      expect(bare.find((x) => x.id === `split_${deg}`)!.points).toHaveLength(0)
    }
  })
})

describe('isReached judges milestones on the best reading, others on the latest', () => {
  const backslid: FlexEntry[] = [
    { date: '2026-01-01', splitDeg: 111, tailorsLeftDeg: null, tailorsRightDeg: null },
    { date: '2026-01-08', splitDeg: 94, tailorsLeftDeg: null, tailorsRightDeg: null },
  ]
  const goals = buildGoals({ ...inputs(HOT_FORTNIGHT), flexEntries: backslid })

  it('keeps a split reached after a tighter session', () => {
    // Best is 111°, latest 94° — the 100° milestone stays in the bag.
    expect(isReached(goals.find((g) => g.id === 'split_100')!)).toBe(true)
  })

  it('leaves a milestone the best never crossed unreached', () => {
    expect(isReached(goals.find((g) => g.id === 'split_120')!)).toBe(false)
  })

  it('reads a bodyweight goal off the latest value, not the best', () => {
    // A run that peaked above 180 then slid back is not at 180 now.
    const slid = buildGoals(
      inputs([
        { date: '2026-01-31', weightLbs: 178 },
        { date: '2026-02-07', weightLbs: 181 },
        { date: '2026-02-14', weightLbs: 179 },
      ]),
    )
    expect(isReached(slid.find((g) => g.id === GOAL_IDS.weight180)!)).toBe(false)
  })
})

describe('projectGoal runs a goal through the model its spec declares', () => {
  /**
   * A fortnight of warm splits climbing about a degree a week, ending on a tight
   * session: 127° on the 11th, then 123° on the 14th.
   */
  const tightLastSession: FlexEntry[] = [
    { date: '2026-02-01', splitDeg: 118, tailorsLeftDeg: null, tailorsRightDeg: null },
    { date: '2026-02-04', splitDeg: 124, tailorsLeftDeg: null, tailorsRightDeg: null },
    { date: '2026-02-08', splitDeg: 121, tailorsLeftDeg: null, tailorsRightDeg: null },
    { date: '2026-02-11', splitDeg: 127, tailorsLeftDeg: null, tailorsRightDeg: null },
    { date: '2026-02-14', splitDeg: 123, tailorsLeftDeg: null, tailorsRightDeg: null },
  ]
  const today = new Date(2026, 1, 14)
  const goals = buildGoals({ ...inputs(HOT_FORTNIGHT), flexEntries: tightLastSession })
  const at = (id: string) => projectGoal(goals.find((g) => g.id === id)!, today)

  it('owes the next rung from the best of the window, matching isReached', () => {
    // The log has cleared 120° on its best (127°), so the rung still open reads
    // its gap from that same 127° rather than from the tight 123°.
    expect(isReached(goals.find((g) => g.id === 'split_120')!)).toBe(true)
    expect(at('split_135').current).toBe(127)
  })

  it('pulls the rung in from where the tight session alone would put it', () => {
    // Read off the tight 123°, the rung is 12° away and a couple of months out.
    // Read off the 127° the same fortnight already reached, it's 8° and half that.
    const g = goals.find((x) => x.id === 'split_135')!
    const unanchored = project(g.points, g.target, today, { decayPerWeek: g.decayPerWeek })

    expect(unanchored.current).toBe(123)
    expect(at('split_135').current).toBe(127)
    expect(at('split_135').etaWeeks!).toBeLessThan(unanchored.etaWeeks!)
  })

  it('still tapers and still reaches the far rungs', () => {
    expect(at('split_180').decayPerWeek).toBe(FLEX_GAIN_DECAY)
    expect(at('split_180').onTrack).toBe(true)
    expect(at('split_180').etaWeeks!).toBeGreaterThan(at('split_150').etaWeeks!)
  })

  it('spends the flex taper against how long the log has been running', () => {
    // The same six weeks of readings, once as the whole log and once as the tail
    // of a year of them. The pace fitted is identical — only the training age
    // behind it differs — so the taper is the only thing that can move the date.
    const recent: FlexEntry[] = [
      { date: '2026-01-10', splitDeg: 104, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-01-24', splitDeg: 106, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-02-07', splitDeg: 108, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-02-14', splitDeg: 110, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    const seasoned: FlexEntry[] = [
      { date: '2025-02-14', splitDeg: 74, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2025-06-14', splitDeg: 90, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2025-10-14', splitDeg: 100, tailorsLeftDeg: null, tailorsRightDeg: null },
      ...recent,
    ]
    const eta = (entries: FlexEntry[], id: string) => {
      const set = buildGoals({ ...inputs(HOT_FORTNIGHT), flexEntries: entries })
      return projectGoal(set.find((g) => g.id === id)!, today)
    }

    const fresh = eta(recent, 'split_180')
    const veteran = eta(seasoned, 'split_180')

    // A new log has its whole taper ahead of it; a year-old one has worked through
    // it, so the pace it is holding is the pace it gets projected at.
    expect(fresh.paceFloorFraction).toBeLessThan(1)
    expect(veteran.paceFloorFraction).toBe(1)
    expect(veteran.slopePerWeek).toBe(fresh.slopePerWeek)
    expect(veteran.etaWeeks!).toBeLessThan(fresh.etaWeeks!)
    // Not made cheap — still years of it — just no longer charged the taper twice.
    expect(veteran.etaWeeks!).toBeGreaterThan(52)
  })

  it('reads the flex pace off six weeks rather than a lucky fortnight', () => {
    // A quiet month then one big session. Over a fortnight that jump is the whole
    // series and fits a runaway pace; over six weeks it is one reading among four.
    const spike: FlexEntry[] = [
      { date: '2026-01-10', splitDeg: 108, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-01-24', splitDeg: 109, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-02-07', splitDeg: 109, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-02-14', splitDeg: 121, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    const set = buildGoals({ ...inputs(HOT_FORTNIGHT), flexEntries: spike })
    const g = set.find((x) => x.id === 'split_180')!
    const fortnight = project(g.points, g.target, today, {
      decayPerWeek: g.decayPerWeek,
      bestOf: 'max',
    })

    expect(g.window!.windowDays).toBe(42)
    expect(projectGoal(g, today).observedSlopePerWeek).toBeLessThan(
      fortnight.observedSlopePerWeek,
    )
  })

  it('leaves the strength and bodyweight ladders on the default window and taper', () => {
    // Training age is only read where the series is a record of training the
    // capability. A 1RM series starts whenever that lift was first logged.
    for (const id of [
      GOAL_IDS.weight180,
      GOAL_IDS.benchBodyweight,
      GOAL_IDS.squatBodyweight,
      GOAL_IDS.squatOneAndAHalf,
      GOAL_IDS.sixPack,
    ]) {
      const g = goals.find((x) => x.id === id)!
      expect(g).toBeDefined()
      expect(g.taperFromHistory).toBeUndefined()
      expect(g.window).toBeUndefined()
    }
  })

  it('leaves a bodyweight goal reading off the latest weigh-in', () => {
    const slid = buildGoals(
      inputs([
        { date: '2026-01-31', weightLbs: 172 },
        { date: '2026-02-07', weightLbs: 176 },
        { date: '2026-02-14', weightLbs: 174 },
      ]),
    )
    const p = projectGoal(slid.find((g) => g.id === GOAL_IDS.weight180)!, today)
    expect(p.current).toBe(174)
    expect(p.capPerWeek).toBe(BODYWEIGHT_GAIN_CAP)
  })

  it('carries both the taper and the pace ceiling a lift goal declares', () => {
    const topSet = (date: string, weight: number): WorkoutRow => ({
      session_id: date,
      date,
      day_type: 'fullbody',
      exercise: 'barbell_squat',
      set_number: 1,
      weight_lbs: weight,
      reps: 5,
      notes: '',
      is_historical: false,
    })
    const squats = [
      topSet('2026-02-01', 155),
      topSet('2026-02-08', 175),
      topSet('2026-02-14', 195),
    ]
    const p = projectGoal(
      buildGoals({ ...inputs(HOT_FORTNIGHT), workouts: squats }).find(
        (g) => g.id === GOAL_IDS.squatOneAndAHalf,
      )!,
      today,
    )
    expect(p.capPerWeek).toBe(SQUAT_GAIN_CAP)
    expect(p.decayPerWeek).toBe(STRENGTH_GAIN_DECAY)
    expect(p.slopePerWeek).toBe(SQUAT_GAIN_CAP)
  })
})

describe('reachedDate reports the day the target was first met', () => {
  it('dates a milestone to the session that crossed it', () => {
    const entries: FlexEntry[] = [
      { date: '2026-01-01', splitDeg: 94, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-01-08', splitDeg: 103, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-01-15', splitDeg: 108, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    const goals = buildGoals({ ...inputs(HOT_FORTNIGHT), flexEntries: entries })
    expect(reachedDate(goals.find((g) => g.id === 'split_100')!)).toBe('2026-01-08')
  })

  it('keeps the original date when a goal falls back off and returns', () => {
    const goals = buildGoals(
      inputs([
        { date: '2026-01-31', weightLbs: 181 },
        { date: '2026-02-07', weightLbs: 176 },
        { date: '2026-02-14', weightLbs: 182 },
      ]),
    )
    expect(reachedDate(goals.find((g) => g.id === GOAL_IDS.weight180)!)).toBe('2026-01-31')
  })

  it('gives no date for a target no reading ever met', () => {
    const goals = buildGoals(inputs(HOT_FORTNIGHT))
    expect(reachedDate(goals.find((g) => g.id === GOAL_IDS.weight190)!)).toBeNull()
  })
})

describe('goalsHitInWeek lists the goals that landed this week', () => {
  /** Thursday of the Mon 2026-02-09 – Sun 2026-02-15 week. */
  const thursday = new Date(2026, 1, 12)

  const spec = (over: Partial<GoalSpec> & { id: string }): GoalSpec => ({
    title: over.id,
    unit: 'lbs',
    exerciseKey: null,
    points: [],
    target: 100,
    direction: 'up',
    ...over,
  })

  it('lists a goal whose target was crossed inside the week', () => {
    const g = spec({ id: 'a', points: [{ date: '2026-02-10', value: 101 }] })
    expect(goalsHitInWeek([g], thursday)).toEqual([{ goal: g, date: '2026-02-10' }])
  })

  it('leaves out one crossed in an earlier week', () => {
    const g = spec({ id: 'a', points: [{ date: '2026-02-08', value: 101 }] })
    expect(goalsHitInWeek([g], thursday)).toEqual([])
  })

  it('orders them by the day they landed on', () => {
    const wed = spec({ id: 'wed', points: [{ date: '2026-02-11', value: 101 }] })
    const mon = spec({ id: 'mon', points: [{ date: '2026-02-09', value: 101 }] })
    expect(goalsHitInWeek([wed, mon], thursday).map((h) => h.goal.id)).toEqual(['mon', 'wed'])
  })

  it('drops a goal that touched its target this week and slid back off it', () => {
    const g = spec({
      id: 'a',
      points: [
        { date: '2026-02-10', value: 101 },
        { date: '2026-02-11', value: 97 },
      ],
    })
    expect(goalsHitInWeek([g], thursday)).toEqual([])
  })

  it('keeps a milestone that slid back — a rung hit stays hit', () => {
    const g = spec({
      id: 'a',
      milestone: true,
      points: [
        { date: '2026-02-10', value: 101 },
        { date: '2026-02-11', value: 97 },
      ],
    })
    expect(goalsHitInWeek([g], thursday)).toEqual([{ goal: g, date: '2026-02-10' }])
  })

  it('never lists the six-pack goal, which is called by eye rather than measured', () => {
    const g = spec({
      id: GOAL_IDS.sixPack,
      direction: 'down',
      target: 12,
      points: [{ date: '2026-02-10', value: 11 }],
    })
    expect(goalsHitInWeek([g], thursday)).toEqual([])
  })

  it('lists a target lost in an earlier week and won back in this one', () => {
    const g = spec({
      id: 'a',
      points: [
        { date: '2026-01-20', value: 101 },
        { date: '2026-02-02', value: 96 },
        { date: '2026-02-10', value: 102 },
      ],
    })
    expect(goalsHitInWeek([g], thursday)).toEqual([{ goal: g, date: '2026-02-10' }])
  })

  it('leaves out a target crossed weeks ago and held ever since', () => {
    const g = spec({
      id: 'a',
      points: [
        { date: '2026-01-20', value: 101 },
        { date: '2026-02-02', value: 103 },
        { date: '2026-02-10', value: 104 },
      ],
    })
    expect(goalsHitInWeek([g], thursday)).toEqual([])
  })

  it('dates a goal by the run it is on, not by a later reading in the same run', () => {
    const g = spec({
      id: 'a',
      points: [
        { date: '2026-02-09', value: 101 },
        { date: '2026-02-11', value: 105 },
      ],
    })
    expect(goalsHitInWeek([g], thursday)).toEqual([{ goal: g, date: '2026-02-09' }])
  })

  it('reads the real goal set — a weigh-in that hit 180 this week', () => {
    const goals = buildGoals(
      inputs([
        { date: '2026-02-07', weightLbs: 178 },
        { date: '2026-02-11', weightLbs: 181 },
      ]),
    )
    expect(goalsHitInWeek(goals, thursday).map((h) => h.goal.id)).toEqual([GOAL_IDS.weight180])
  })

  it('reads the real goal set — 180 lost in January and won back this week', () => {
    const goals = buildGoals(
      inputs([
        { date: '2026-01-17', weightLbs: 181 },
        { date: '2026-01-31', weightLbs: 178 },
        { date: '2026-02-11', weightLbs: 180 },
      ]),
    )
    expect(goalsHitInWeek(goals, thursday)).toEqual([
      { goal: goals.find((g) => g.id === GOAL_IDS.weight180)!, date: '2026-02-11' },
    ])
  })
})

describe('the bench goal reads both presses', () => {
  const press = (
    session: string,
    date: string,
    exercise: string,
    weight: number,
    reps: number,
    variant?: 'A' | 'B',
  ): WorkoutRow => ({
    session_id: session,
    date,
    day_type: 'push',
    exercise,
    set_number: 1,
    weight_lbs: weight,
    reps,
    notes: '',
    is_historical: false,
    variant,
  })

  const benchGoal = (workouts: WorkoutRow[]) =>
    buildGoals({ ...inputs(HOT_FORTNIGHT), workouts }).find(
      (g) => g.id === GOAL_IDS.benchBodyweight,
    )!

  // Flat bench leads variant B — four sets, first press of the day — and follows
  // incline in variant A. Reading flat alone left the variant-A day off the goal
  // entirely, so a logged push day could leave the goal on a fortnight-old number.
  it('counts the push day where incline led, not just the ones flat led', () => {
    const rows = [
      press('lead', '2026-08-04', 'flat_bench', 155, 8, 'B'),
      press('off', '2026-08-08', 'incline_bench', 135, 8, 'A'),
      press('off', '2026-08-08', 'flat_bench', 145, 8, 'A'),
    ]
    const goal = benchGoal(rows)

    expect(goal.points.map((p) => p.date)).toEqual(['2026-08-04', '2026-08-08'])
    // The day's best press, whichever of the two it was: flat 145×8 beats incline
    // 135×8 even done second.
    expect(goal.points[1].value).toBeCloseTo(183.7, 1)
  })

  it('takes a reading from an incline-only session', () => {
    const rows = [press('a', '2026-08-08', 'incline_bench', 135, 8, 'A')]
    expect(benchGoal(rows).points).toEqual([{ date: '2026-08-08', value: 171 }]) // 135×8
  })

  it('names flat bench as the lift it is cued on, with incline counted alongside', () => {
    const goal = benchGoal([press('a', '2026-08-08', 'flat_bench', 155, 8, 'B')])
    expect(goal.exerciseKey).toBe('flat_bench')
    expect(goal.alsoCounts).toEqual(['incline_bench'])
  })

  it('leaves the squat goals reading squat alone', () => {
    const rows = [press('a', '2026-08-08', 'barbell_squat', 225, 5)]
    const goals = buildGoals({ ...inputs(HOT_FORTNIGHT), workouts: rows })
    for (const id of [GOAL_IDS.squatBodyweight, GOAL_IDS.squatOneAndAHalf]) {
      expect(goals.find((g) => g.id === id)!.alsoCounts).toBeUndefined()
    }
  })
})
