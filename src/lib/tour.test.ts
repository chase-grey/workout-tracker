import { describe, expect, it } from 'vitest'
import {
  advanceTour,
  currentTourStep,
  FRESH_TOUR,
  restartTour,
  skipTour,
  TOUR_STEPS,
  tourBody,
  tourPosition,
  tourSteps,
  type TourStep,
} from './tour'
import type { Profile } from './profile'

const profile = (pillars: Profile['pillars']): Profile => ({ name: 'a', pillars }) as Profile

describe('tourSteps', () => {
  it('gives no calorie step to someone not tracking diet', () => {
    const ids = tourSteps(profile(['strength', 'flexibility'])).map((s) => s.id)
    expect(ids).not.toContain('calories')
    expect(ids).toContain('plan')
  })

  it('gives no plan step to someone not lifting', () => {
    const ids = tourSteps(profile(['diet'])).map((s) => s.id)
    expect(ids).not.toContain('plan')
    expect(ids).toContain('calories')
  })

  it('keeps every step, in order, for someone tracking everything', () => {
    const all = tourSteps(profile(['strength', 'flexibility', 'cardio', 'diet']))
    expect(all.map((s) => s.id)).toEqual(TOUR_STEPS.map((s) => s.id))
  })

  it('always keeps the steps that need no pillar', () => {
    const ids = tourSteps(profile(['cardio'])).map((s) => s.id)
    expect(ids).toEqual(expect.arrayContaining(['tiles', 'streak', 'freeze', 'progress']))
  })
})

describe('progress', () => {
  const steps = tourSteps(profile(['strength', 'diet']))

  it('starts at the first step', () => {
    expect(currentTourStep(steps, FRESH_TOUR)?.id).toBe(steps[0].id)
  })

  it('walks the steps in order and ends after the last', () => {
    let state = FRESH_TOUR
    const shown: string[] = []
    for (let step = currentTourStep(steps, state); step; step = currentTourStep(steps, state)) {
      shown.push(step.id)
      state = advanceTour(steps, state, step.id)
    }
    expect(shown).toEqual(steps.map((s) => s.id))
    expect(state.done).toBe(true)
  })

  it('does not replay once done', () => {
    expect(currentTourStep(steps, { seen: [], done: true })).toBeNull()
  })

  it('skip ends it and keeps what was seen', () => {
    const state = skipTour(advanceTour(steps, FRESH_TOUR, 'tiles'))
    expect(state).toEqual({ seen: ['tiles'], done: true })
  })

  it('picks up a step added after the person had gone past the rest', () => {
    const later: TourStep[] = [...steps, { id: 'new', anchor: 'tiles', title: 't', body: 'b' }]
    const seenAll = { seen: steps.map((s) => s.id), done: false }
    expect(currentTourStep(later, seenAll)?.id).toBe('new')
  })

  it('does not count a seen id twice', () => {
    const once = advanceTour(steps, FRESH_TOUR, 'tiles')
    expect(advanceTour(steps, once, 'tiles').seen).toEqual(['tiles'])
  })

  it('restarts from the top', () => {
    expect(restartTour()).toEqual({ seen: [], done: false })
  })

  it('reports the position among the filtered steps', () => {
    const calories = steps.find((s) => s.id === 'calories')!
    expect(tourPosition(steps, calories)).toEqual({ index: steps.indexOf(calories) + 1, total: steps.length })
  })
})

describe('tourBody', () => {
  const plan = TOUR_STEPS.find((s) => s.id === 'plan')!
  it('adds the coach line only with the coach on', () => {
    expect(tourBody(plan, false)).toBe(plan.body)
    expect(tourBody(plan, true)).toContain('coach')
  })
})
