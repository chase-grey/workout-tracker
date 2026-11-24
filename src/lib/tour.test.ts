import { describe, expect, it } from 'vitest'
import {
  advanceTour,
  currentTourStep,
  FRESH_TOUR,
  restartTour,
  skipTour,
  TOUR_STEPS,
  tourCardTop,
  tourPosition,
  tourSpot,
  tourSteps,
  type TourStep,
} from './tour'
import type { Profile } from './profile'

const profile = (pillars: Profile['pillars']): Profile => ({ name: 'a', pillars }) as Profile
const everything = profile(['strength', 'flexibility', 'cardio', 'diet'])

describe('tourSteps', () => {
  it('gives no food step to someone not tracking diet', () => {
    const ids = tourSteps(profile(['strength', 'flexibility']), false).map((s) => s.id)
    expect(ids).not.toContain('food')
  })

  it('gives the coach step only with the coach on', () => {
    expect(tourSteps(everything, false).map((s) => s.id)).not.toContain('coachTab')
    expect(tourSteps(everything, true).map((s) => s.id)).toContain('coachTab')
  })

  it('keeps every step, in order, for someone tracking everything with the coach on', () => {
    expect(tourSteps(everything, true).map((s) => s.id)).toEqual(TOUR_STEPS.map((s) => s.id))
  })

  it('always keeps the steps that need nothing', () => {
    const ids = tourSteps(profile(['cardio']), false).map((s) => s.id)
    expect(ids).toEqual(['week', 'start', 'progressTab', 'settingsTab'])
  })

  it('visits every tab the bar shows, left to right, and never goes back to one', () => {
    const order = ['today', 'progress', 'coach', 'settings']
    for (const coachOn of [true, false]) {
      const tabs = tourSteps(everything, coachOn).map((s) => s.tab)
      const visited = tabs.filter((t, i) => t !== tabs[i - 1])
      expect(visited).toEqual(order.filter((t) => t !== 'coach' || coachOn))
    }
  })
})

describe('progress', () => {
  const steps = tourSteps(profile(['strength', 'diet']), false)

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
    const state = skipTour(advanceTour(steps, FRESH_TOUR, 'week'))
    expect(state).toEqual({ seen: ['week'], done: true })
  })

  it('picks up a step added after the person had gone past the rest', () => {
    const later: TourStep[] = [...steps, { id: 'new', tab: 'today', title: 't', body: 'b' }]
    const seenAll = { seen: steps.map((s) => s.id), done: false }
    expect(currentTourStep(later, seenAll)?.id).toBe('new')
  })

  it('does not count a seen id twice', () => {
    const once = advanceTour(steps, FRESH_TOUR, 'week')
    expect(advanceTour(steps, once, 'week').seen).toEqual(['week'])
  })

  it('restarts from the top', () => {
    expect(restartTour()).toEqual({ seen: [], done: false })
  })

  it('reports the position among the filtered steps', () => {
    const food = steps.find((s) => s.id === 'food')!
    expect(tourPosition(steps, food)).toEqual({ index: steps.indexOf(food) + 1, total: steps.length })
  })
})

describe('tourSpot', () => {
  const bounds = { top: 0, bottom: 800, width: 400 }

  it('grows the target by the padding', () => {
    expect(tourSpot({ top: 100, left: 20, width: 360, height: 50 }, bounds, 4)).toEqual({
      top: 96,
      left: 16,
      width: 368,
      height: 58,
    })
  })

  it('keeps to the part that is on screen', () => {
    const spot = tourSpot({ top: 700, left: 0, width: 400, height: 300 }, bounds, 4)
    expect(spot).toEqual({ top: 696, left: 0, width: 400, height: 104 })
  })

  it('is nothing for a target scrolled away or without a size', () => {
    expect(tourSpot({ top: 900, left: 0, width: 400, height: 50 }, bounds, 4)).toBeNull()
    expect(tourSpot({ top: 100, left: 0, width: 0, height: 0 }, bounds, 4)).toBeNull()
  })
})

describe('tourCardTop', () => {
  const box = (top: number, height: number) => ({ top, left: 0, width: 400, height })

  it('sits under what it points at when there is room', () => {
    expect(tourCardTop(box(100, 80), 200, 800, 12)).toBe(192)
  })

  it('sits over it when the room is above', () => {
    expect(tourCardTop(box(740, 50), 200, 800, 12)).toBe(528)
  })

  it('lies across the bottom of a target that fills the screen', () => {
    expect(tourCardTop(box(0, 800), 200, 800, 12)).toBe(588)
  })

  it('sits in the middle with nothing to point at', () => {
    expect(tourCardTop(null, 200, 800, 12)).toBe(300)
  })
})
