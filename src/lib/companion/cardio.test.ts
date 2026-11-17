import { describe, it, expect } from 'vitest'
import { planFor } from '../../config/planTemplates'
import type { CardioEntry } from '../cardio'
import {
  buildCardioPlan,
  endCardioPlan,
  MI_10K,
  MI_5K,
  MI_HALF,
  plannedMinutes,
  RAMP,
  RAMP_FLOOR_WEEK_MIN,
  suggestTargetDate,
  type CardioPlan,
} from '../cardioPlan'
import { applyCompanionOps, type CompanionState } from './apply'
import type { CardioContext } from './cardio'
import { changeOps, companionStatus, parseCompanionReply, readDays, readDistance } from './parse'
import { undoneCardioPlan } from './undo'

const plan = planFor({ daysPerWeek: 2, equipment: 'gym', focus: ['chest'], minutes: 45 })
const MON = '2026-11-16'
const block = (...lines: string[]) => ['WT v1', 'summary: x', ...lines, 'END'].join('\n')

let n = 0
const run = (date: string, minutes: number, distanceMi?: number): CardioEntry => ({
  id: `c${n++}`,
  date,
  kind: 'run',
  minutes,
  ...(distanceMi ? { distanceMi } : {}),
})

/** Two runs a week for the last four weeks, the longest 20 min / 1.8 mi. */
const LOG: CardioEntry[] = [
  run('2026-10-20', 15, 1.3),
  run('2026-10-25', 18, 1.6),
  run('2026-10-27', 15, 1.3),
  run('2026-11-01', 20, 1.8),
  run('2026-11-03', 15, 1.3),
  run('2026-11-08', 20, 1.8),
  run('2026-11-10', 16, 1.4),
  run('2026-11-15', 20, 1.8),
]

const ctx: CardioContext = { today: MON, entries: LOG, liftDays: [0, 3], weeklyCardio: 3 }

function parse(...lines: string[]) {
  return parseCompanionReply(block(...lines), { plan, cardio: true })
}

function apply(lines: string[], cardioPlan?: CardioPlan, c: CardioContext = ctx) {
  const p = parse(...lines)
  expect(p.errors).toEqual([])
  const state: CompanionState = { plan, weeklyWorkouts: 2, ...(cardioPlan ? { cardioPlan } : {}) }
  return applyCompanionOps(state, p.ops, c)
}

describe('reading cardio lines', () => {
  it('reads a distance goal with days and a date', () => {
    const p = parse('cardio goal kind=run dist=5k days=tue,thu,sat by=2027-02-01')
    expect(companionStatus(p)).toBe('ready')
    expect(changeOps(p)).toEqual([
      { op: 'cardio.goal', kind: 'run', goal: { type: 'distance', distanceMi: MI_5K }, days: [1, 3, 5], by: '2027-02-01' },
    ])
  })

  it('takes the goal type from what is given', () => {
    const [time] = changeOps(parse('cardio goal dist=10k time=55:00'))
    expect(time).toMatchObject({ goal: { type: 'time', distanceMi: MI_10K, minutes: 55 } })
    const [weekly] = changeOps(parse('cardio goal kind=walk min=150'))
    expect(weekly).toMatchObject({ kind: 'walk', goal: { type: 'weekly', minutes: 150 } })
    const [mi] = changeOps(parse('cardio goal type=distance mi=3.1'))
    expect(mi).toMatchObject({ goal: { type: 'distance', distanceMi: MI_5K } })
  })

  it('reads distances as races, miles, kilometres and metres', () => {
    expect(readDistance('half')).toBe(MI_HALF)
    expect(readDistance('half marathon')).toBe(MI_HALF)
    expect(readDistance('5 km')).toBe(MI_5K)
    expect(readDistance('2.5mi')).toBe(2.5)
    expect(readDistance('1609.344m')).toBe(1)
    expect(readDistance('far')).toBeNull()
  })

  it('reads days in the ways a chat AI writes them', () => {
    expect(readDays('tue,thu,sat')).toEqual([1, 3, 5])
    expect(readDays('Tuesday, Thursday and Saturday')).toEqual([1, 3, 5])
    expect(readDays('sat/tues/thurs')).toEqual([1, 3, 5])
    expect(readDays('tue,someday')).toMatch(/"someday" isn't a day/)
  })

  it('reads the other cardio ops', () => {
    expect(changeOps(parse('cardio level longest=20 weekly=60 pace=11:30/mi now=34:00'))).toEqual([
      { op: 'cardio.level', longestMin: 20, weeklyMin: 60, paceMinPerMi: 11.5, timeMin: 34 },
    ])
    expect(changeOps(parse('cardio level longest=2mi'))).toEqual([{ op: 'cardio.level', longestMi: 2 }])
    expect(changeOps(parse('cardio days mon wed sat'))).toEqual([{ op: 'cardio.days', days: [0, 2, 5] }])
    expect(changeOps(parse('cardio date 2027-3-1'))).toEqual([{ op: 'cardio.date', by: '2027-03-01' }])
    expect(changeOps(parse('cardio checkpoint dist=2mi', 'cardio checkpoint dist=5k time=32:00', 'cardio checkpoint week=90'))).toEqual([
      { op: 'cardio.checkpoint', distanceMi: 2 },
      { op: 'cardio.checkpoint', distanceMi: MI_5K, withinMin: 32 },
      { op: 'cardio.checkpoint', weekMin: 90 },
    ])
    expect(changeOps(parse('cardio replan', 'cardio end'))).toEqual([{ op: 'cardio.replan' }, { op: 'cardio.end' }])
  })

  it('reports what it cannot read, line by line', () => {
    const p = parse(
      'cardio goal dist=far',
      'cardio goal dist=5k time=soon',
      'cardio goal kind=soccer dist=5k',
      'cardio goal kind=skating min=100',
      'cardio days mon,tue,wed,thu,fri,sat,sun',
      'cardio date next spring',
      'cardio level',
      'cardio sprint',
      'cardio goal min=150 by=2027-02-30',
    )
    expect(p.errors.map((e) => e.message)).toEqual([
      expect.stringMatching(/isn't a distance/),
      expect.stringMatching(/isn't a time/),
      expect.stringMatching(/soccer has no distance/),
      expect.stringMatching(/isn't one of run, walk/),
      expect.stringMatching(/7 days is too many/),
      expect.stringMatching(/isn't a date like/),
      expect.stringMatching(/needs longest=/),
      expect.stringMatching(/"cardio sprint" isn't an op/),
      expect.stringMatching(/"2027-02-30" isn't a date/),
    ])
  })

  it('clamps numbers and says so', () => {
    const p = parse('cardio goal min=5000', 'cardio level pace=1:00')
    expect(changeOps(p)).toEqual([
      { op: 'cardio.goal', goal: { type: 'weekly', minutes: 1200 } },
      { op: 'cardio.level', paceMinPerMi: 2 },
    ])
    expect(p.adjusted).toEqual(['line 3: min 5000 → 1200', 'line 4: pace 1 → 2'])
  })

  it('refuses cardio where it is not tracked, and points the old running ops at it', () => {
    const off = parseCompanionReply(block('cardio goal dist=5k'), { plan, cardio: false })
    expect(off.errors[0].message).toMatch(/cardio isn't tracked/)
    const old = parse('runplan template=c25k')
    expect(old.errors[0].message).toMatch(/use cardio goal/)
  })
})

describe('building the plan from cardio ops', () => {
  it('builds a new plan through the generator, from the log, and says it plainly', () => {
    const r = apply(['cardio goal kind=run dist=5k days=tue,thu,sat'])
    expect(r.errors).toEqual([])
    const p = r.next.cardioPlan!
    expect(p.goal).toEqual({ type: 'distance', distanceMi: MI_5K })
    expect(p.days).toEqual([1, 3, 5])
    expect(p.level.longestMin).toBe(20)
    expect(p.targetDate).toBe(suggestTargetDate('run', p.goal, p.level, [1, 3, 5], MON))
    expect(r.applied[0]).toMatch(/^cardio plan: run 5k by [a-z]{3} \d+ · tue\/thu\/sat · \d+ weeks$/)
    expect(r.applied[1]).toMatch(/^starting from: longest 20 min · 1\.8 mi · \d+ min a week/)
    expect(r.applied[2]).toMatch(/^first week \(nov 16\): tue easy run \d+ min · thu easy run \d+ min · sat long run/)
  })

  it('is the plan the goal sheet builds from the same answers', () => {
    const r = apply(['cardio goal kind=run dist=5k days=tue,thu,sat'])
    const p = r.next.cardioPlan!
    const sheet = buildCardioPlan({ kind: 'run', goal: p.goal, level: p.level, days: p.days, targetDate: p.targetDate }, MON, undefined, p.id)
    expect(p.weeks).toEqual(sheet.weeks)
    expect(p.checkpoints).toEqual(sheet.checkpoints)
  })

  it("keeps the ramp: no week grows more than a tenth, or the floor, over the one before", () => {
    const p = apply(['cardio goal dist=half days=tue,thu,sun', 'cardio level longest=30 weekly=60']).next.cardioPlan!
    const build = p.weeks.filter((w) => w.phase === 'build' || w.phase === 'hold')
    for (let i = 1; i < build.length; i++) {
      const was = plannedMinutes(build[i - 1])
      // Rounding each session to a minute can add a minute a session.
      expect(plannedMinutes(build[i])).toBeLessThanOrEqual(Math.max(was * (1 + RAMP), was + RAMP_FLOOR_WEEK_MIN) + 3)
    }
  })

  it("moves a date sooner than the ramp gets there to the date it does, with a note", () => {
    const r = apply(['cardio goal dist=10k days=tue,thu,sat by=2026-12-01'])
    const p = r.next.cardioPlan!
    expect(p.targetDate).toBe(suggestTargetDate('run', p.goal, p.level, p.days, MON))
    expect(r.notes[0]).toMatch(/^by dec 1 → [a-z]{3} \d+: the earliest the plan gets there adding a tenth a week$/)
    const later = apply(['cardio goal dist=10k days=tue,thu,sat by=2027-09-01'])
    expect(later.next.cardioPlan!.targetDate).toBe('2027-09-01')
    expect(later.notes).toEqual([])
  })

  it('lets where-you-are override the log', () => {
    const p = apply(['cardio goal dist=5k', 'cardio level longest=35 longestmi=3 weekly=90']).next.cardioPlan!
    expect(p.level).toMatchObject({ longestMin: 35, longestMi: 3, weeklyMin: 90 })
  })

  it('starts a new plan clear of lifting days, on the weekly cardio count', () => {
    const p = apply(['cardio goal dist=5k']).next.cardioPlan!
    expect(p.days).toHaveLength(3)
    for (const d of p.days) expect([0, 3]).not.toContain(d)
  })

  it('edits a plan being followed: same goal keeps its id, checkpoints and date', () => {
    const before = apply(['cardio goal dist=5k days=tue,thu,sat by=2027-04-01']).next.cardioPlan!
    const r = apply(['cardio days tue,fri,sun'], before)
    const after = r.next.cardioPlan!
    expect(after.id).toBe(before.id)
    expect(after.checkpoints).toEqual(before.checkpoints)
    expect(after.targetDate).toBe('2027-04-01')
    expect(after.days).toEqual([1, 4, 6])
    expect(r.applied[0]).toMatch(/\(days tue\/thu\/sat → tue\/fri\/sun\)$/)
  })

  it("keeps a date the person set even when it's sooner than the ramp would pick", () => {
    const tight = buildCardioPlan(
      { kind: 'run', goal: { type: 'distance', distanceMi: MI_5K }, level: { longestMin: 20, longestMi: 1.8, weeklyMin: 40 }, days: [1, 3, 5], targetDate: '2026-12-19' },
      MON,
    )
    expect(apply(['cardio days tue,thu,sun'], tight).next.cardioPlan!.targetDate).toBe('2026-12-19')
    const echoed = apply(['cardio date 2026-12-19'], tight)
    expect(echoed.next.cardioPlan!.targetDate).toBe('2026-12-19')
    expect(echoed.notes).toEqual([])
  })

  it('replaces the goal, saying from what to what', () => {
    const before = apply(['cardio goal dist=5k days=tue,thu,sat']).next.cardioPlan!
    const r = apply(['cardio goal dist=10k'], before)
    expect(r.next.cardioPlan!.goal).toEqual({ type: 'distance', distanceMi: MI_10K })
    expect(r.next.cardioPlan!.id).not.toBe(before.id)
    expect(r.applied[0]).toMatch(/^cardio plan: run 5k → run 10k by /)
  })

  it('re-plans and ends a plan being followed', () => {
    const before = apply(['cardio goal dist=5k days=tue,thu,sat']).next.cardioPlan!
    const later: CardioContext = { ...ctx, today: '2026-12-07', entries: [...LOG, run('2026-12-05', 30, 2.6)] }
    const re = apply(['cardio replan'], before, later)
    expect(re.next.cardioPlan!.replannedAt).toBe('2026-12-07')
    expect(re.applied[0]).toBe('re-plan run 5k from where the log says you are')
    const end = apply(['cardio end'], before)
    expect(end.next.cardioPlan!.endedAt).toBe(MON)
    expect(end.applied).toEqual(['end cardio plan: run 5k'])
  })

  it('adds checkpoints, and passes over one already there', () => {
    const before = apply(['cardio goal dist=5k days=tue,thu,sat']).next.cardioPlan!
    const r = apply(['cardio checkpoint min=25', `cardio checkpoint dist=${MI_5K}`], before)
    expect(r.applied).toEqual(['checkpoint: 25 min without stopping'])
    expect(r.notes).toEqual(['checkpoint 5k is already there'])
    expect(r.next.cardioPlan!.checkpoints.some((c) => c.minutes === 25)).toBe(true)
  })

  it('applies nothing it cannot make sense of', () => {
    expect(apply(['cardio days tue,sat']).errors).toEqual(["there's no cardio plan yet — start with a cardio goal line"])
    expect(apply(['cardio replan']).errors[0]).toMatch(/no cardio plan to re-plan/)
    expect(apply(['cardio end']).errors[0]).toMatch(/no cardio plan to end/)
    const before = apply(['cardio goal dist=5k']).next.cardioPlan!
    expect(apply(['cardio end', 'cardio days tue,sat'], before).errors[0]).toMatch(/can't go with other cardio changes/)
    const none = applyCompanionOps({ plan, weeklyWorkouts: 2 }, parse('cardio goal dist=5k').ops)
    expect(none.errors).toEqual(["cardio isn't tracked in this app, so there's no cardio plan to change"])
  })

  it('leaves the lift plan and weekly goal alone, and changes both in one reply', () => {
    const r = apply(['weekly workouts=3', 'cardio goal dist=5k'])
    expect(r.next.weeklyWorkouts).toBe(3)
    expect(r.next.plan).toBe(plan)
    expect(r.next.cardioPlan).toBeDefined()
  })
})

describe('undoing a cardio change', () => {
  const made = () => apply(['cardio goal dist=5k']).next.cardioPlan!

  it('restores the plan before, ends the AI plan where there was none, and leaves an untouched plan alone', () => {
    const before = made()
    const snap = { at: '', summary: '', plan }
    expect(undoneCardioPlan({ ...snap, cardioPlan: before }, made(), MON)).toBe(before)
    expect(undoneCardioPlan({ ...snap, cardioPlan: null }, before, MON)).toEqual(endCardioPlan(before, MON))
    expect(undoneCardioPlan(snap, before, MON)).toBeUndefined()
  })
})
