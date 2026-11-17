import { describe, it, expect } from 'vitest'
import { planFor } from '../../config/planTemplates'
import { PLAN } from '../../config/plan'
import type { WorkoutRow } from '../../types'
import type { Profile } from '../profile'
import type { CardioEntry } from '../cardio'
import { buildCardioPlan, MI_5K } from '../cardioPlan'
import { BOOTSTRAP_LINE, PROMPT_MAX_CHARS, buildCompanionPrompt, buildRepairPrompt } from './prompt'
import { parseCompanionReply } from './parse'

const today = new Date(2026, 10, 16) // Monday 2026-11-16
const plan = planFor({ daysPerWeek: 2, equipment: 'gym', focus: ['chest'], minutes: 45 })
const profile: Profile = {
  name: 'Maya',
  pillars: ['strength'],
  sex: 'female',
  birthYear: 1992,
  strength: { daysPerWeek: 2, equipment: 'gym', focus: ['chest'], minutes: 45 },
  weeklyGoals: [],
  calorieGoals: [],
  createdAt: '2026-10-01T00:00:00Z',
}

function row(date: string, session: string, exercise: string, weight: number | null, reps: number, notes = ''): WorkoutRow {
  return {
    session_id: session,
    date,
    day_type: 'push',
    exercise,
    set_number: 1,
    weight_lbs: weight,
    reps,
    notes,
    is_historical: false,
  }
}

const workouts: WorkoutRow[] = [
  row('2026-11-03', 'a', 'flat_bench', 95, 8),
  row('2026-11-03', 'a', 'flat_bench', 100, 6),
  row('2026-11-10', 'b', 'flat_bench', 105, 6),
  row('2026-11-10', 'b', 'flat_bench', 100, 8),
  row('2026-11-12', 'c', 'leg_press', 180, 10, 'discomfort:knee'),
  row('2026-08-01', 'old', 'flat_bench', 300, 1),
]

const input = { today, plan, profile, heightIn: 66, workouts, weeklyWorkouts: 2 }

describe('buildCompanionPrompt', () => {
  const text = buildCompanionPrompt(input)

  it('fits in one paste', () => {
    expect(text.length).toBeLessThanOrEqual(PROMPT_MAX_CHARS)
  })

  it('asks for questions first and one block after', () => {
    expect(text).toMatch(/up to 4 short questions/)
    expect(text).toMatch(/ONE code block/)
    expect(text).toMatch(/Nothing after END/)
  })

  it('lists every exercise key by day', () => {
    for (const d of ['push', 'pull'] as const) {
      for (const e of plan[d].exercises) expect(text).toContain(e.key)
    }
    expect(text).toContain('day=push "full body a"')
    expect(text).not.toContain('day=fullbody')
    expect(text).toContain('cable_pulldown "lat pulldown" 2x8-12 90s')
  })

  it('says who this is without naming them', () => {
    expect(text).toContain("ME: woman, 34 years old, 5'6\" tall; lifts 2 days a week, full gym")
    expect(text).toContain('weekly goal 2 workouts')
    expect(text).not.toContain('Maya')
  })

  it('summarises the last four weeks', () => {
    expect(text).toContain('workouts per week 0, 1, 2, 0')
    expect(text).toContain('leg_press 180x10, flat_bench 105x6')
    expect(text).not.toContain('300x1')
    expect(text).toContain('Discomfort flagged: knee on leg_press')
  })

  it('is deterministic', () => {
    expect(buildCompanionPrompt(input)).toBe(text)
  })

  it('leaves weekly out where it cannot be set', () => {
    expect(buildCompanionPrompt({ ...input, weeklyWorkouts: null })).not.toContain('weekly workouts=N')
  })

  it('carries an example the parser reads', () => {
    const p = parseCompanionReply(text, { plan })
    expect(p.errors).toEqual([])
    expect(p.complete).toBe(true)
  })

  it('stays under the cap with the owner plan and a long history', () => {
    const many: WorkoutRow[] = []
    PLAN.push.exercises.concat(PLAN.pull.exercises, PLAN.fullbody.exercises).forEach((e, i) => {
      many.push(row(`2026-11-${String(1 + (i % 14)).padStart(2, '0')}`, `s${i % 9}`, e.key, 100 + i, 8))
    })
    const long = buildCompanionPrompt({ ...input, plan: PLAN, profile: null, workouts: many })
    expect(long.length).toBeLessThanOrEqual(PROMPT_MAX_CHARS)
    for (const e of PLAN.pull.exercises) expect(long).toContain(e.key)
  })
})

const runs: CardioEntry[] = [
  { id: 'r1', date: '2026-11-01', kind: 'run', minutes: 18, distanceMi: 1.6 },
  { id: 'r2', date: '2026-11-08', kind: 'run', minutes: 20, distanceMi: 1.8 },
  { id: 'r3', date: '2026-11-11', kind: 'walk', minutes: 40 },
  { id: 'r4', date: '2026-11-15', kind: 'run', minutes: 22, distanceMi: 2 },
]
const cardioProfile: Profile = { ...profile, pillars: ['strength', 'cardio'] }
const withCardio = { ...input, profile: cardioProfile, cardio: { entries: runs, liftDays: [0, 3] } }

describe('cardio in the prompt', () => {
  it('opened on cardio, is about the cardio plan alone', () => {
    const text = buildCompanionPrompt({ ...withCardio, focus: 'cardio' })
    expect(text.length).toBeLessThanOrEqual(PROMPT_MAX_CHARS)
    expect(text).toMatch(/^You are my running and cardio coach/)
    expect(text).toContain('Today is 2026-11-16.')
    expect(text).toContain('CARDIO NOW (run, from my log, last 6 weeks): longest 22 min / 2 mi')
    expect(text).toContain('CARDIO PLAN: none yet.')
    expect(text).toContain('I usually lift on mon/thu')
    expect(text).toContain('cardio goal kind=run|walk')
    expect(text).toContain('cardio checkpoint')
    expect(text).toMatch(/at most 10% more a week/)
    expect(text).not.toContain('lift add')
    expect(text).not.toContain('PLAN (exercise key')
  })

  it("carries an example the parser reads as a plan", () => {
    const text = buildCompanionPrompt({ ...withCardio, focus: 'cardio' })
    const p = parseCompanionReply(text, { plan, cardio: true })
    expect(p.errors).toEqual([])
    expect(p.ops.map((o) => o.op)).toEqual(['summary', 'cardio.goal', 'cardio.level'])
  })

  it('shows the plan being followed as the coach reads it', () => {
    const cardioPlan = buildCardioPlan(
      { kind: 'run', goal: { type: 'distance', distanceMi: MI_5K }, level: { longestMin: 20, longestMi: 1.8, weeklyMin: 40 }, days: [1, 3, 5], targetDate: '2027-02-06' },
      '2026-11-16',
    )
    const text = buildCompanionPrompt({ ...withCardio, cardio: { ...withCardio.cardio, plan: cardioPlan }, focus: 'cardio' })
    expect(text).toContain('CARDIO PLAN (run 5k):')
    expect(text).toContain('Goal: run 5k by 2027-02-06')
    expect(text).toMatch(/This week: tue easy run/)
  })

  it('rides along with the lift plan, and still fits', () => {
    const text = buildCompanionPrompt(withCardio)
    expect(text.length).toBeLessThanOrEqual(PROMPT_MAX_CHARS)
    expect(text).toContain('lift add day=')
    expect(text).toContain('CARDIO NOW')
    expect(text).toContain('cardio goal kind=')
    expect(text).not.toContain('cardio checkpoint')
    expect(parseCompanionReply(text, { plan, cardio: true }).errors).toEqual([])
  })

  it('leaves cardio out without the pillar', () => {
    expect(buildCompanionPrompt(input)).not.toContain('cardio')
  })

  it('stays under the cap with a long cardio log', () => {
    const many: CardioEntry[] = Array.from({ length: 40 }, (_, i) => ({
      id: `m${i}`,
      date: `2026-11-${String(1 + (i % 15)).padStart(2, '0')}`,
      kind: i % 2 ? 'run' : 'bike',
      minutes: 30 + i,
      distanceMi: 3 + i / 10,
    }))
    const big = { ...withCardio, plan: PLAN, cardio: { entries: many, liftDays: [0, 2, 4] } }
    expect(buildCompanionPrompt(big).length).toBeLessThanOrEqual(PROMPT_MAX_CHARS)
    expect(buildCompanionPrompt({ ...big, focus: 'cardio' }).length).toBeLessThanOrEqual(PROMPT_MAX_CHARS)
  })
})

describe('buildRepairPrompt', () => {
  it('quotes each bad line and asks for the whole block', () => {
    const p = parseCompanionReply('WT v1\nsummary: x\nlift superset day=push ex=flat_bench\nEND', { plan })
    const text = buildRepairPrompt(p)
    expect(text).toContain('- line 3 `lift superset day=push ex=flat_bench`: "lift superset" isn\'t an op')
    expect(text).toMatch(/Resend the WHOLE WT v1 block/)
  })

  it('asks for a resend when the reply was cut off', () => {
    expect(buildRepairPrompt(parseCompanionReply('WT v1\nsummary: x', { plan }))).toMatch(/cut off before END/)
  })

  it('asks for the block when there was none', () => {
    expect(buildRepairPrompt(parseCompanionReply('hi', { plan }))).toMatch(/couldn't find a WT v1 block/)
  })

  it('has a bootstrap short enough for a URL', () => {
    expect(encodeURIComponent(BOOTSTRAP_LINE).length).toBeLessThan(300)
  })
})
