import { describe, expect, it } from 'vitest'
import { DROP_ORDER, GROW_FLOOR_SETS, KEEP_FLOOR_SETS, buildPlan, fitStatus, priceDay } from './planBuilder'
import { MUSCLES, MUSCLE_LABELS, WORKOUT_MINUTES, type Muscle, type StrengthSetup } from './profile'
import { DAY_TYPES, PLAN_REVISION, shortExercises, withPlanDefaults, type PlannedExercise } from '../config/plan'
import { hasShortForm } from './sessionLength'
import { WORK_PER_SET_SEC } from './estimate'
import { pairKeys } from './pairedSides'

const EQUIPMENT = ['gym', 'dumbbells', 'bodyweight'] as const
const FOCI: Muscle[][] = [
  [],
  ['chest'],
  ['back'],
  ['glutes', 'quads'],
  ['arms', 'shoulders'],
  ['chest', 'back', 'shoulders', 'arms', 'glutes'],
  ['calves', 'abs', 'hamstrings'],
  [...MUSCLES],
]

const SETUPS: StrengthSetup[] = []
for (const daysPerWeek of [2, 3] as const)
  for (const equipment of EQUIPMENT)
    for (const minutes of WORKOUT_MINUTES)
      for (const focus of FOCI) SETUPS.push({ daysPerWeek, equipment, minutes, focus })

const used = (s: StrengthSetup) => DAY_TYPES.slice(0, s.daysPerWeek)

/** The groups a muscle's direct work is filed under. */
const GROUPS: Record<Muscle, RegExp> = {
  chest: /^chest$/,
  back: /^back$/,
  shoulders: /^shoulders$/,
  arms: /^(biceps|triceps)$/,
  glutes: /^glutes$/,
  quads: /^quads$/,
  hamstrings: /^hamstrings$/,
  abs: /^(abs|core hold)$/,
  calves: /^calves$/,
}

describe('priceDay', () => {
  const row = (key: string, sets: number, restSec: number, extra: Partial<PlannedExercise> = {}): PlannedExercise => ({
    key,
    name: key,
    sets,
    repMin: 8,
    repMax: 12,
    restSec,
    group: 'g',
    ...extra,
  })

  it('prices each set as working time plus the rest the flow prescribes after it', () => {
    // a a a | b b: a's own rest twice, the move to b at b's rest, b's rest once, nothing after the last.
    const day = [row('a', 3, 120), row('b', 2, 60)]
    expect(priceDay(day)).toBe(5 * WORK_PER_SET_SEC + 120 + 120 + 60 + 60)
  })

  it('caps the rest on the way to a new movement', () => {
    expect(priceDay([row('a', 1, 60), row('b', 1, 180)])).toBe(2 * WORK_PER_SET_SEC + 90)
  })

  it('prices a hold at its seconds', () => {
    expect(priceDay([row('p', 2, 60, { timed: true, repMax: 60 })])).toBe(60 + 60 + 60)
  })

  it('is nothing for an empty day', () => {
    expect(priceDay([])).toBe(0)
  })
})

describe.each(SETUPS)('buildPlan %o', (setup) => {
  const build = buildPlan(setup)
  const { plan } = build

  it('never prices a session over the chosen length', () => {
    expect(build.budgetSec).toBe(setup.minutes! * 60)
    for (const t of DAY_TYPES) expect(priceDay(plan[t].exercises)).toBeLessThanOrEqual(build.budgetSec)
    expect(build.daySecs).toHaveLength(setup.daysPerWeek)
  })

  it('fills exactly the days asked for, all custom, the third left empty on a two-day week', () => {
    DAY_TYPES.forEach((t, i) => {
      expect(plan[t].custom).toBe(true)
      expect(plan[t].type).toBe(t)
      expect(plan[t].order).toBe(i)
      if (i < setup.daysPerWeek) expect(plan[t].exercises.length).toBeGreaterThan(0)
      else expect(plan[t].exercises).toEqual([])
    })
  })

  it('gives every row a short count, cutting sets before movements', () => {
    for (const t of used(setup)) {
      const { exercises } = plan[t]
      expect(new Set(exercises.map((e) => e.key)).size).toBe(exercises.length)
      expect(exercises.filter((e) => e.shortSets === 0).length).toBeLessThanOrEqual(1)
      for (const e of exercises) {
        expect(e.shortSets).toBeTypeOf('number')
        expect(e.sets).toBeGreaterThan(0)
        expect(e.repMin).toBeLessThanOrEqual(e.repMax)
        if (e.shortSets! > 0) expect(e.shortSets).toBe(e.sets >= 3 ? e.sets - 1 : e.sets)
        expect(e).not.toHaveProperty('side')
      }
      const short = shortExercises(exercises, 'short')
      expect(short.length).toBeGreaterThan(0)
      expect(priceDay(short)).toBeLessThanOrEqual(priceDay(exercises))
    }
  })

  it('generates nothing one side at a time, so no pair can be split', () => {
    for (const t of used(setup)) {
      const keys = plan[t].exercises.map((e) => e.key)
      for (const k of keys) expect(pairKeys(keys, k)).toEqual([k])
    }
  })

  it('grows every muscle it says it fits, on every lifting day', () => {
    for (const m of build.fitted) {
      expect(build.weekly[m]).toBeGreaterThanOrEqual(GROW_FLOOR_SETS)
      const days = used(setup).filter((t) => plan[t].exercises.some((e) => GROUPS[m].test(e.group)))
      expect(days.length).toBe(setup.daysPerWeek)
    }
  })

  it('accounts for every pick, fitted or not, in pick order', () => {
    expect([...build.fitted, ...build.unfitted].sort()).toEqual([...setup.focus!].sort())
    const order = build.fitted.map((m) => setup.focus!.indexOf(m))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('gives up a pick only after the unpicked muscles have started giving way', () => {
    const first = DROP_ORDER.find((m) => !setup.focus!.includes(m))
    if (!build.unfitted.length || !first) return
    const direct = used(setup).flatMap((t) => plan[t].exercises.map((e) => e.group))
    expect(direct.some((g) => GROUPS[first].test(g))).toBe(false)
  })

  it('maintains whatever it does not name as unmaintained', () => {
    for (const m of MUSCLES) {
      if (build.fitted.includes(m) || build.unmaintained.includes(m)) continue
      expect(build.weekly[m]).toBeGreaterThanOrEqual(KEEP_FLOOR_SETS)
    }
  })

  it('survives withPlanDefaults untouched', () => {
    expect(withPlanDefaults(plan, 0)).toEqual(plan)
    expect(withPlanDefaults(plan, PLAN_REVISION)).toEqual(plan)
  })

  it('has a short form on every used day', () => {
    for (const t of used(setup)) expect(hasShortForm(plan[t])).toBe(true)
  })
})

describe('buildPlan', () => {
  it('is deterministic', () => {
    const s: StrengthSetup = { daysPerWeek: 3, equipment: 'dumbbells', minutes: 45, focus: ['arms', 'glutes'] }
    expect(buildPlan(s)).toEqual(buildPlan({ ...s, focus: [...s.focus!] }))
  })

  it('gives a picked muscle more weekly sets than it gets unpicked', () => {
    for (const equipment of EQUIPMENT) {
      for (const daysPerWeek of [2, 3] as const) {
        const base = buildPlan({ daysPerWeek, equipment, minutes: 75, focus: [] })
        for (const m of MUSCLES) {
          const picked = buildPlan({ daysPerWeek, equipment, minutes: 75, focus: [m] })
          expect(picked.fitted).toEqual([m])
          expect(picked.weekly[m]).toBeGreaterThan(base.weekly[m])
          expect(picked.weekly[m]).toBeGreaterThanOrEqual(GROW_FLOOR_SETS)
        }
      }
    }
  })

  it('holds the unpicked muscles at maintenance, not growth, when there is room', () => {
    const b = buildPlan({ daysPerWeek: 3, equipment: 'gym', minutes: 75, focus: ['chest'] })
    expect(b.unmaintained).toEqual([])
    for (const m of ['quads', 'hamstrings', 'back', 'calves', 'abs'] as Muscle[]) {
      expect(b.weekly[m]).toBeGreaterThanOrEqual(KEEP_FLOOR_SETS)
      expect(b.weekly[m]).toBeLessThan(GROW_FLOOR_SETS)
    }
  })

  it('says plainly when the picks do not fit, and that a day or time would help', () => {
    const s: StrengthSetup = {
      daysPerWeek: 2,
      equipment: 'gym',
      minutes: 30,
      focus: ['chest', 'back', 'shoulders', 'arms', 'glutes'],
    }
    const b = buildPlan(s)
    expect(b.unfitted.length).toBeGreaterThan(0)
    expect(fitStatus(s, b)).toBe(`fits ${b.fitted.length} of your 5 focus muscles — add a day or time`)
  })

  it('suggests only time once all three days are in use', () => {
    const s: StrengthSetup = {
      daysPerWeek: 3,
      equipment: 'gym',
      minutes: 30,
      focus: ['chest', 'back', 'shoulders', 'arms', 'glutes'],
    }
    expect(fitStatus(s)).toMatch(/^fits \d of your 5 focus muscles — add time$/)
  })

  it('leaves unpicked muscles untrained before it gives up a pick, and says which', () => {
    for (const equipment of EQUIPMENT) {
      for (const focus of [['chest'], ['back'], ['glutes', 'quads'], ['chest', 'back'], ['arms', 'shoulders']] as Muscle[][]) {
        const s: StrengthSetup = { daysPerWeek: 2, equipment, minutes: 30, focus }
        const b = buildPlan(s)
        expect(b.fitted).toEqual(focus)
        expect(b.unmaintained.length).toBeGreaterThan(0)
        for (const m of b.unmaintained) expect(focus).not.toContain(m)
        expect(fitStatus(s, b)).toBe(
          `about ${Math.round(Math.max(...b.daySecs) / 60)} min · ${b.unmaintained.map((m) => MUSCLE_LABELS[m]).join(', ')} untrained`,
        )
      }
    }
  })

  it('drops the small isolation muscles first', () => {
    const b = buildPlan({ daysPerWeek: 2, equipment: 'gym', minutes: 30, focus: ['chest'] })
    expect(b.unmaintained).toEqual(['calves', 'abs'])
  })

  it('maintains the whole body when nothing is picked', () => {
    for (const equipment of EQUIPMENT)
      for (const daysPerWeek of [2, 3] as const)
        for (const minutes of WORKOUT_MINUTES) {
          const s: StrengthSetup = { daysPerWeek, equipment, minutes, focus: [] }
          const b = buildPlan(s)
          expect(b.unmaintained).toEqual([])
          expect(fitStatus(s, b)).toMatch(/^about \d+ min a session$/)
        }
  })

  it('suggests nothing when the longest week still will not hold them', () => {
    const s: StrengthSetup = { daysPerWeek: 3, equipment: 'gym', minutes: 75, focus: [...MUSCLES] }
    const b = buildPlan(s)
    if (b.unfitted.length) expect(fitStatus(s, b)).toBe(`fits ${b.fitted.length} of your 9 focus muscles`)
    else expect(fitStatus(s, b)).toMatch(/^about \d+ min a session$/)
  })

  it('reports the session length when everything fits', () => {
    const s: StrengthSetup = { daysPerWeek: 3, equipment: 'gym', minutes: 60, focus: ['arms'] }
    const b = buildPlan(s)
    expect(b.unfitted).toEqual([])
    expect(fitStatus(s, b)).toBe(`about ${Math.round(Math.max(...b.daySecs) / 60)} min a session`)
  })

  it('keeps a later pick that fits when an earlier one does not', () => {
    const s: StrengthSetup = { daysPerWeek: 2, equipment: 'gym', minutes: 45, focus: [...MUSCLES] }
    const b = buildPlan(s)
    expect(b.unfitted.length).toBeGreaterThan(0)
    const lastFitted = s.focus!.indexOf(b.fitted[b.fitted.length - 1])
    expect(lastFitted).toBeGreaterThan(s.focus!.indexOf(b.unfitted[0]))
  })

  it('reads a profile without a length as an hour, and ignores unknown or repeated picks', () => {
    const b = buildPlan({ daysPerWeek: 2, equipment: 'gym', focus: ['chest', 'chest', 'neck' as Muscle] })
    expect(b.budgetSec).toBe(3600)
    expect(b.fitted).toEqual(['chest'])
  })

  it('drops the last accessory, and only it, from the short day', () => {
    const { plan } = buildPlan({ daysPerWeek: 2, equipment: 'gym', minutes: 60, focus: ['chest'] })
    const ex = plan.push.exercises
    expect(ex[ex.length - 1].shortSets).toBe(0)
    expect(ex.slice(0, -1).every((e) => (e.shortSets ?? 0) > 0)).toBe(true)
  })
})
