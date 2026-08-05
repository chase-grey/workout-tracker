import { describe, it, expect } from 'vitest'
import type { FlexEntry } from './flex'
import { flexGoalPredictions, SPLIT_GOALS, TAILORS_GOALS } from './flexPredict'

/** A fixed clock so ETA dates are deterministic. */
const TODAY = new Date(2026, 0, 22) // 2026-01-22, a week after the last entry below

/** Improving split (70→100) and improving tailor's (60→80) across four weekly sessions. */
const entries: FlexEntry[] = [
  { date: '2026-01-01', splitDeg: 70, tailorsLeftDeg: 58, tailorsRightDeg: 62 },
  { date: '2026-01-08', splitDeg: 80, tailorsLeftDeg: 63, tailorsRightDeg: 67 },
  { date: '2026-01-15', splitDeg: 90, tailorsLeftDeg: 68, tailorsRightDeg: 72 },
  { date: '2026-01-22', splitDeg: 100, tailorsLeftDeg: 78, tailorsRightDeg: 82 },
]

describe('flexGoalPredictions', () => {
  it('returns one goal per split target and per tailors target, in order', () => {
    const goals = flexGoalPredictions(entries, TODAY)
    expect(goals).toHaveLength(SPLIT_GOALS.length + TAILORS_GOALS.length)

    const splitGoals = goals.filter((g) => g.kind === 'split')
    const tailorsGoals = goals.filter((g) => g.kind === 'tailors')
    expect(splitGoals).toHaveLength(SPLIT_GOALS.length)
    expect(tailorsGoals).toHaveLength(TAILORS_GOALS.length)

    // Split goals come first (ascending), then tailors.
    expect(goals.slice(0, SPLIT_GOALS.length).every((g) => g.kind === 'split')).toBe(true)
    expect(goals.slice(SPLIT_GOALS.length).every((g) => g.kind === 'tailors')).toBe(true)
  })

  it('populates kind, target, and label for each goal', () => {
    const goals = flexGoalPredictions(entries, TODAY)

    for (const target of SPLIT_GOALS) {
      const g = goals.find((x) => x.kind === 'split' && x.target === target)
      expect(g).toBeDefined()
      expect(g!.label).toBe(`${target}° split`)
      expect(g!.proj.target).toBe(target)
    }
    for (const target of TAILORS_GOALS) {
      const g = goals.find((x) => x.kind === 'tailors' && x.target === target)
      expect(g).toBeDefined()
      expect(g!.label).toBe(`${target}° tailor's pose`)
      expect(g!.proj.target).toBe(target)
    }
  })

  it('marks an already-reached goal on track with etaWeeks 0', () => {
    // Latest split is exactly 100, so the 100° goal is reached now.
    const reached = flexGoalPredictions(entries, TODAY).find(
      (g) => g.kind === 'split' && g.target === 100,
    )!
    expect(reached.reached).toBe(true)
    expect(reached.proj.onTrack).toBe(true)
    expect(reached.proj.etaWeeks).toBe(0)
    expect(reached.proj.etaDate).toBe('2026-01-22')
  })

  it('marks a goal the readings have sailed past as reached', () => {
    // 111.6° is well beyond the 100° goal — the projector has no ETA to give for
    // a gap pointing the other way, so `reached` is what says it's done.
    const past = [...entries, { date: '2026-01-29', splitDeg: 111.6, tailorsLeftDeg: null, tailorsRightDeg: null }]
    const goals = flexGoalPredictions(past, new Date(2026, 0, 29))
    const hundred = goals.find((g) => g.kind === 'split' && g.target === 100)!
    expect(hundred.reached).toBe(true)
    expect(goals.find((g) => g.kind === 'split' && g.target === 120)!.reached).toBe(false)
  })

  it('keeps a goal reached after a tighter session', () => {
    // A milestone doesn't un-happen: the best reading decides, not the latest.
    const backslid = [...entries, { date: '2026-01-29', splitDeg: 94, tailorsLeftDeg: null, tailorsRightDeg: null }]
    const hundred = flexGoalPredictions(backslid, new Date(2026, 0, 29)).find(
      (g) => g.kind === 'split' && g.target === 100,
    )!
    expect(hundred.reached).toBe(true)
  })

  it('leaves every goal unreached with no measurements', () => {
    expect(flexGoalPredictions([], TODAY).every((g) => g.reached)).toBe(false)
    expect(flexGoalPredictions([], TODAY).some((g) => g.reached)).toBe(false)
  })

  it('gives a far, still-improving goal a future etaDate (or null if unreachable)', () => {
    const far = flexGoalPredictions(entries, TODAY).find(
      (g) => g.kind === 'split' && g.target === 180,
    )!
    // Split is improving ~10°/week toward 180, so it should be on track.
    expect(far.proj.onTrack).toBe(true)
    expect(far.proj.etaWeeks).not.toBeNull()
    expect(far.proj.etaDate).not.toBeNull()
    // ETA must be strictly in the future relative to today.
    expect(far.proj.etaDate! > '2026-01-22').toBe(true)
  })

  it('projects the improving tailors trend on track toward its 90 goal', () => {
    const tailors = flexGoalPredictions(entries, TODAY).find(
      (g) => g.kind === 'tailors' && g.target === 90,
    )!
    expect(tailors.proj.onTrack).toBe(true)
    expect(tailors.proj.etaWeeks).not.toBeNull()
    expect(tailors.proj.etaDate).not.toBeNull()
  })

  it('yields null etas with fewer than two measurements', () => {
    const single: FlexEntry[] = [
      { date: '2026-01-01', splitDeg: 70, tailorsLeftDeg: 60, tailorsRightDeg: 60 },
    ]
    const goals = flexGoalPredictions(single, TODAY)
    for (const g of goals) {
      expect(g.proj.etaWeeks).toBeNull()
      expect(g.proj.etaDate).toBeNull()
      expect(g.proj.onTrack).toBe(false)
    }
  })

  it('yields null etas with no measurements at all', () => {
    const goals = flexGoalPredictions([], TODAY)
    expect(goals).toHaveLength(SPLIT_GOALS.length + TAILORS_GOALS.length)
    for (const g of goals) {
      expect(g.proj.etaWeeks).toBeNull()
      expect(g.proj.etaDate).toBeNull()
    }
  })
})
