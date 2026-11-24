import { describe, expect, it } from 'vitest'
import { angleTrends } from './angleContext'
import { dedupeFlexByDate, pelvicTiltSeries, type FlexEntry } from './flex'
import { manualResult } from './manualAngle'
import {
  angleMarks,
  anglesFromHandles,
  defaultHandles,
  handlesFromLandmarks,
  levelGuide,
  summarizeResult,
  tiltBelowLevel,
} from './measure'
import { dueGate } from './photoCadence'
import { coldGate, gateAfterStep, postureGate, shotMeasurement } from './photoSteps'
import { buildSessionSteps } from './flexSteps'
import { FLEX_ROUTINES } from '../config/flexRoutines'
import type { Landmark } from './pose'

const entry = (date: string, over: Partial<FlexEntry> = {}): FlexEntry => ({
  date,
  splitDeg: null,
  tailorsLeftDeg: null,
  tailorsRightDeg: null,
  ...over,
})

describe('tiltBelowLevel', () => {
  it('reads how far the front hip bone sits below the back one, off level', () => {
    expect(tiltBelowLevel({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0)
    expect(tiltBelowLevel({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(45)
    expect(tiltBelowLevel({ x: 0, y: 0 }, { x: 10, y: 2 })).toBe(11.3)
  })

  it('reads the same whichever way the body faces', () => {
    expect(tiltBelowLevel({ x: 10, y: 0 }, { x: 0, y: 2 })).toBe(11.3)
  })

  it('reports no forward tilt for a front bone level with the back one or above it', () => {
    expect(tiltBelowLevel({ x: 0, y: 0 }, { x: 10, y: -3 })).toBe(0)
  })
})

describe('the pelvic tilt pose', () => {
  it('measures in the photo, not in normalized space', () => {
    // A portrait photo, 3:4. The dots are 0.2 apart across and 0.03 down: in
    // pixels that is 0.15 across to 0.03 down.
    const h = { back: { x: 0.4, y: 0.5 }, front: { x: 0.6, y: 0.53 } }
    expect(anglesFromHandles('pelvic_tilt', h, 0.75)).toEqual({ pelvicTiltDeg: 11.3 })
    expect(anglesFromHandles('pelvic_tilt', h, 1)).toEqual({ pelvicTiltDeg: 8.5 })
  })

  it('starts from a forward tilt worth dragging, and summarises as one number', () => {
    const r = anglesFromHandles('pelvic_tilt', defaultHandles('pelvic_tilt'), 0.75)
    expect(r.pelvicTiltDeg).toBeGreaterThan(0)
    expect(summarizeResult('pelvic_tilt', { pelvicTiltDeg: 12.5 })).toBe('12.5°')
  })

  it('draws a level line from the back bone and an arc down to the front one', () => {
    const h = { back: { x: 0.4, y: 0.5 }, front: { x: 0.6, y: 0.53 } }
    const guide = levelGuide('pelvic_tilt', h)
    expect(guide?.from).toEqual(h.back)
    expect(guide?.toX).toBeGreaterThan(h.front.x)
    expect(levelGuide('split', defaultHandles('split'))).toBeNull()

    const [mark] = angleMarks('pelvic_tilt', { back: { x: 400, y: 500 }, front: { x: 600, y: 540 } }, { pelvicTiltDeg: 11.3 })
    expect(mark.vertex).toEqual({ x: 400, y: 500 })
    expect(mark.rays[0]).toEqual({ x: 1, y: 0 })
    expect(mark.deg).toBe(11.3)
  })

  it('places the dots either side of the hip, the front one on the side the knee is', () => {
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }))
    lms[11] = { x: 0.5, y: 0.25, visibility: 0.9 } // left shoulder
    lms[23] = { x: 0.5, y: 0.5, visibility: 0.9 } // left hip
    lms[25] = { x: 0.53, y: 0.7, visibility: 0.9 } // left knee, ahead of the hip: facing right
    const facingRight = handlesFromLandmarks('pelvic_tilt', lms)!
    expect(facingRight.front.x).toBeGreaterThan(0.5)
    expect(facingRight.back.x).toBeLessThan(0.5)
    // Both sit above the hip joint, the back one higher: a forward tilt to start from.
    expect(facingRight.back.y).toBeLessThan(facingRight.front.y)
    expect(facingRight.front.y).toBeLessThan(0.5)

    lms[25] = { x: 0.47, y: 0.7, visibility: 0.9 }
    const facingLeft = handlesFromLandmarks('pelvic_tilt', lms)!
    expect(facingLeft.front.x).toBeLessThan(0.5)
  })

  it('takes a typed angle', () => {
    expect(manualResult('pelvic_tilt', ['12'])).toEqual({ pelvicTiltDeg: 12 })
  })
})

describe('the posture photo', () => {
  it('logs to its own field, as a measurement', () => {
    expect(shotMeasurement('pelvic-tilt', { pelvicTiltDeg: 13.4 })).toEqual({ note: 'measurement', pelvicTiltDeg: 13.4 })
  })

  it('is asked for at the top of the routine once a week, and never after it', () => {
    const gate = coldGate('pelvic_tilt')
    expect(gate.shots).toEqual(['pelvic-tilt'])
    // 2026-11-23 is a Monday.
    expect(dueGate(gate, [], '2026-11-24')).toEqual(gate)
    expect(dueGate(gate, [entry('2026-11-23', { pelvicTiltDeg: 14 })], '2026-11-24')).toBeNull()
    expect(dueGate(gate, [entry('2026-11-22', { pelvicTiltDeg: 14 })], '2026-11-24')).toEqual(gate)

    const steps = buildSessionSteps(FLEX_ROUTINES.pelvic_tilt.blocks, { core: false })
    expect(steps.every((_, i) => gateAfterStep(steps, i, 'pelvic_tilt') == null)).toBe(true)
  })

  it('can be asked for from the goals panel', () => {
    expect(postureGate()).toEqual({ id: 'goal', title: 'posture photo', shots: ['pelvic-tilt'] })
  })

  it('survives a day being merged, and reads back as a series', () => {
    const entries = [
      entry('2026-11-10', { pelvicTiltDeg: 16 }),
      entry('2026-11-17', { note: 'stretch', routines: ['pelvic_tilt'] }),
      entry('2026-11-17', { pelvicTiltDeg: 14.5, note: 'measurement' }),
    ]
    expect(dedupeFlexByDate(entries).at(-1)?.pelvicTiltDeg).toBe(14.5)
    expect(pelvicTiltSeries(entries)).toEqual([
      { date: '2026-11-10', value: 16 },
      { date: '2026-11-17', value: 14.5 },
    ])
  })

  it('reads a smaller tilt as the improvement, with no ladder and no cold or warm', () => {
    const [t] = angleTrends([entry('2026-11-17', { pelvicTiltDeg: 16 })], { pelvicTiltDeg: 14 }, 'cold', '2026-11-24')
    expect(t).toMatchObject({ metric: 'pelvicTilt', plain: true, value: 14, delta: 2, isBest: true, goal: null, coldToday: null })
  })
})
