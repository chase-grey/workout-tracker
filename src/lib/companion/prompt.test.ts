import { describe, it, expect } from 'vitest'
import { planFor } from '../../config/planTemplates'
import { PLAN } from '../../config/plan'
import type { WorkoutRow } from '../../types'
import type { Profile } from '../profile'
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
