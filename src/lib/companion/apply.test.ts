import { describe, it, expect } from 'vitest'
import { planFor } from '../../config/planTemplates'
import { PLAN } from '../../config/plan'
import { applyCompanionOps } from './apply'
import { changeOps, parseCompanionReply } from './parse'
import { clearAiChange, giveCompanionConsent, hasCompanionConsent, lastAiChange, saveAiChange } from './undo'

const plan = planFor({ daysPerWeek: 2, equipment: 'gym', focus: ['chest'], minutes: 45 })
const keys = (p: typeof plan, d: 'push' | 'pull') => p[d].exercises.map((e) => e.key)

function run(lines: string[], state = { plan, weeklyWorkouts: 2 as number | null }) {
  const parse = parseCompanionReply(['WT v1', 'summary: x', ...lines, 'END'].join('\n'), { plan: state.plan })
  expect(parse.errors).toEqual([])
  return applyCompanionOps(state, parse.ops)
}

describe('applyCompanionOps', () => {
  it('changes sets, reps and rest and says what moved', () => {
    const r = run(['lift set day=push ex=flat_bench sets=4 reps=5-8 rest=150'])
    const bench = r.next.plan.push.exercises.find((e) => e.key === 'flat_bench')!
    expect([bench.sets, bench.repMin, bench.repMax, bench.restSec]).toEqual([4, 5, 8, 150])
    expect(r.applied).toEqual(['flat bench press on push: 3 → 4 sets, 6–10 → 5–8 reps, 120s → 150s rest'])
    expect(plan.push.exercises.find((e) => e.key === 'flat_bench')!.sets).toBe(3)
  })

  it('adds a custom row and a known exercise with its settings', () => {
    const r = run(['lift add day=pull name="zottman curl" sets=2 reps=10-12 rest=60', 'lift add day=pull name="hammer curl"'])
    const pull = r.next.plan.pull.exercises
    expect(pull.find((e) => e.name === 'zottman curl')).toMatchObject({ key: 'zottman_curl', sets: 2, group: 'custom' })
    const hammer = pull.find((e) => e.key === 'hammer_curl')!
    expect(hammer.name).toBe('hammer curl')
    expect(hammer.group).not.toBe('custom')
  })

  it('swaps by remove then add, in order', () => {
    const r = run(['lift remove day=push ex=cable_fly', 'lift add day=push name=dips sets=3 reps=8-12 rest=90'])
    expect(keys(r.next.plan, 'push')).not.toContain('cable_fly')
    expect(keys(r.next.plan, 'push')).toContain('dips')
  })

  it('moves within a day', () => {
    const r = run(['lift move day=push ex=calf_raise to=1'])
    expect(keys(r.next.plan, 'push')[0]).toBe('calf_raise')
  })

  it('sets the weekly goal, and refuses it where there is none', () => {
    expect(run(['weekly workouts=3']).next.weeklyWorkouts).toBe(3)
    const none = applyCompanionOps({ plan, weeklyWorkouts: null }, [{ op: 'weekly', workouts: 3 }])
    expect(none.errors).toEqual(["the weekly goal can't be changed here"])
  })

  it('reports an op that the plan has moved out from under', () => {
    const r = applyCompanionOps({ plan, weeklyWorkouts: 2 }, [
      { op: 'lift.remove', day: 'push', key: 'cable_fly' },
      { op: 'lift.remove', day: 'push', key: 'cable_fly' },
    ])
    expect(r.errors).toEqual(['no exercise "cable_fly" on push'])
  })
})

describe('left and right', () => {
  const state = { plan: PLAN, weeklyWorkouts: null }

  it('applies a set on one side to both', () => {
    const r = applyCompanionOps(state, [{ op: 'lift.set', day: 'push', key: 'lateral_raise_l', sets: 2, repMin: 15, repMax: 20 }])
    const sides = r.next.plan.push.exercises.filter((e) => e.key.startsWith('lateral_raise_'))
    expect(sides.map((e) => [e.key, e.sets, e.repMin, e.repMax])).toEqual([
      ['lateral_raise_l', 2, 15, 20],
      ['lateral_raise_r', 2, 15, 20],
    ])
    expect(r.applied[0]).toMatch(/\(both sides\) on push/)
  })

  it('removes both sides together', () => {
    const r = applyCompanionOps(state, [{ op: 'lift.remove', day: 'pull', key: 'copenhagen_plank_r' }])
    expect(r.next.plan.pull.exercises.some((e) => e.key.startsWith('copenhagen_plank'))).toBe(false)
  })
})

describe('undo snapshot', () => {
  const mem = () => {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    }
  }

  it('keeps the last change for seven days', () => {
    const kv = mem()
    saveAiChange({ at: '2026-11-16T10:00:00Z', summary: 'x', plan }, kv)
    expect(lastAiChange(new Date('2026-11-20T10:00:00Z'), kv)?.summary).toBe('x')
    expect(lastAiChange(new Date('2026-11-24T10:00:00Z'), kv)).toBeNull()
    clearAiChange(kv)
    expect(lastAiChange(new Date('2026-11-17T10:00:00Z'), kv)).toBeNull()
  })

  it('remembers consent once given', () => {
    const kv = mem()
    expect(hasCompanionConsent(kv)).toBe(false)
    giveCompanionConsent(new Date(), kv)
    expect(hasCompanionConsent(kv)).toBe(true)
  })
})

it('changeOps leaves out summary and ask', () => {
  const p = parseCompanionReply('WT v1\nsummary: x\nweekly workouts=3\nEND', { plan })
  expect(changeOps(p)).toEqual([{ op: 'weekly', workouts: 3 }])
})
