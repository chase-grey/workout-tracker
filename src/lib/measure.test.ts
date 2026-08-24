import { describe, it, expect } from 'vitest'
import {
  HANDLES,
  MEASURE_MODES,
  SEGMENTS,
  VERTICAL_REF,
  angleMarks,
  anglesFromHandles,
  defaultHandles,
  handlesFromLandmarks,
  hasSides,
  resultReadings,
  summarizeResult,
  swapSides,
  verticalGuide,
  type AngleMark,
  type Handles,
} from './measure'
import { POSE, type Pt } from './splitAngle'
import type { Landmark } from './pose'

describe('defaultHandles', () => {
  it('provides every handle key each mode declares', () => {
    for (const mode of ['split', 'tailors'] as const) {
      const h = defaultHandles(mode)
      for (const spec of HANDLES[mode]) expect(h[spec.key]).toBeDefined()
    }
  })

  it('references only known handle keys in its segments', () => {
    for (const mode of ['split', 'tailors'] as const) {
      const keys = new Set(HANDLES[mode].map((s) => s.key))
      for (const seg of SEGMENTS[mode]) {
        expect(keys.has(seg.from)).toBe(true)
        expect(keys.has(seg.to)).toBe(true)
      }
    }
  })
})

describe('anglesFromHandles', () => {
  it('split: straight horizontal line is ~180°', () => {
    const h: Handles = {
      hip: { x: 0.5, y: 0.5 },
      ankleL: { x: 0.1, y: 0.5 },
      ankleR: { x: 0.9, y: 0.5 },
    }
    expect(anglesFromHandles('split', h, 1).splitDeg).toBeCloseTo(180, 0)
  })

  it('split: reads the angle drawn on the photo, not the normalized one', () => {
    // Same handles, 45° apart from vertical on a square photo. A 3:4 portrait
    // shot squeezes the horizontal reach, so the real angle is narrower.
    const h: Handles = {
      hip: { x: 0.5, y: 0.5 },
      ankleL: { x: 0.2, y: 0.8 },
      ankleR: { x: 0.8, y: 0.8 },
    }
    expect(anglesFromHandles('split', h, 1).splitDeg).toBeCloseTo(90, 0)
    expect(anglesFromHandles('split', h, 0.75).splitDeg).toBeCloseTo(73.7, 1)
  })

  it('tailors: knees level with the center dot read ~90° off vertical', () => {
    const h: Handles = {
      center: { x: 0.5, y: 0.7 },
      kneeL: { x: 0.3, y: 0.7 },
      kneeR: { x: 0.7, y: 0.7 },
    }
    const r = anglesFromHandles('tailors', h, 0.75)
    expect(r.tailorsLeftDeg).toBeCloseTo(90, 0)
    expect(r.tailorsRightDeg).toBeCloseTo(90, 0)
  })

  it('tailors: a knee straight above the center dot reads ~0°', () => {
    const h: Handles = {
      center: { x: 0.5, y: 0.7 },
      kneeL: { x: 0.5, y: 0.4 },
      kneeR: { x: 0.7, y: 0.55 },
    }
    const r = anglesFromHandles('tailors', h, 0.75)
    expect(r.tailorsLeftDeg).toBeCloseTo(0, 0)
  })
})

describe('angleMarks', () => {
  /** The angle the mark's own rays span, which is what an arc across it draws. */
  const spanned = (m: AngleMark): number => {
    const [a, b] = m.rays
    const dot = Math.min(1, Math.max(-1, a.x * b.x + a.y * b.y))
    return (Math.acos(dot) * 180) / Math.PI
  }

  /** Handles in pixel space, where the drawn angle is the logged one. */
  const inPixels = (h: Handles, w: number, hgt: number): Handles =>
    Object.fromEntries(Object.entries(h).map(([k, p]) => [k, { x: p.x * w, y: p.y * hgt }]))

  it('split: opens from the hip, not the middle of a leg', () => {
    const h: Handles = {
      hip: { x: 0.5, y: 0.5 },
      ankleL: { x: 0.2, y: 0.8 },
      ankleR: { x: 0.8, y: 0.8 },
    }
    const [m] = angleMarks('split', inPixels(h, 900, 1200), { splitDeg: 73.7 })
    expect(m.vertex).toEqual({ x: 450, y: 600 })
    // The wedge between the legs opens downward, so that's where the number goes.
    expect(m.bisector.x).toBeCloseTo(0, 5)
    expect(m.bisector.y).toBeGreaterThan(0)
  })

  it('draws the angle it reports, at the aspect the photo was measured at', () => {
    const h: Handles = {
      hip: { x: 0.5, y: 0.5 },
      ankleL: { x: 0.2, y: 0.8 },
      ankleR: { x: 0.8, y: 0.8 },
    }
    for (const [w, hgt] of [
      [1200, 1200],
      [900, 1200],
      [1600, 900],
    ]) {
      const logged = anglesFromHandles('split', h, w / hgt).splitDeg!
      const [m] = angleMarks('split', inPixels(h, w, hgt), { splitDeg: logged })
      expect(spanned(m)).toBeCloseTo(logged, 1)
    }
  })

  it('split: a full straddle still has somewhere to put the number', () => {
    const h: Handles = {
      hip: { x: 0.5, y: 0.5 },
      ankleL: { x: 0.1, y: 0.5 },
      ankleR: { x: 0.9, y: 0.5 },
    }
    const [m] = angleMarks('split', inPixels(h, 1200, 1200), { splitDeg: 180 })
    expect(spanned(m)).toBeCloseTo(180, 1)
    // Legs straight out leave two bisectors; the number belongs below the hip,
    // away from the body.
    expect(Math.hypot(m.bisector.x, m.bisector.y)).toBeCloseTo(1, 5)
    expect(m.bisector.y).toBeGreaterThan(0)
  })

  it("tailors: one mark per knee, both off the vertical at the center dot", () => {
    const h: Handles = {
      center: { x: 0.5, y: 0.9 },
      kneeL: { x: 0.3, y: 0.75 },
      kneeR: { x: 0.72, y: 0.8 },
    }
    const r = anglesFromHandles('tailors', h, 0.75)
    const marks = angleMarks('tailors', inPixels(h, 900, 1200), r)
    expect(marks).toHaveLength(2)
    for (const m of marks) {
      expect(m.vertex).toEqual({ x: 450, y: 1080 })
      expect(m.rays[0]).toEqual({ x: 0, y: -1 })
      expect(spanned(m)).toBeCloseTo(m.deg, 1)
    }
    // Each number is colored to its own line, which is what tells them apart.
    expect(marks.map((m) => m.role)).toEqual(['a', 'b'])
    expect(marks[0].deg).toBe(r.tailorsLeftDeg)
    expect(marks[1].deg).toBe(r.tailorsRightDeg)
    // Left knee out to the left: its wedge, and its number, sit on that side.
    expect(marks[0].bisector.x).toBeLessThan(0)
    expect(marks[1].bisector.x).toBeGreaterThan(0)
  })

  it('leaves out a reading it has no handles or no number for', () => {
    expect(angleMarks('split', defaultHandles('split'), {})).toEqual([])
    expect(angleMarks('split', { hip: { x: 1, y: 1 } }, { splitDeg: 90 })).toEqual([])
    const h = { ...defaultHandles('tailors') }
    expect(angleMarks('tailors', h, { tailorsLeftDeg: 55 })).toHaveLength(1)
    // A knee dragged onto the center dot has no direction to measure.
    expect(
      angleMarks('tailors', { ...h, kneeL: h.center }, { tailorsLeftDeg: 55 }),
    ).toEqual([])
  })
})

describe('verticalGuide', () => {
  it('is only drawn for a pose measured off vertical', () => {
    expect(VERTICAL_REF.split).toBeNull()
    expect(verticalGuide('split', defaultHandles('split'))).toBeNull()
    expect(verticalGuide('tailors', defaultHandles('tailors'))).not.toBeNull()
  })

  it('reaches up past the highest knee it is measured against', () => {
    const h: Handles = {
      center: { x: 0.5, y: 0.9 },
      kneeL: { x: 0.3, y: 0.6 },
      kneeR: { x: 0.7, y: 0.75 },
    }
    const g = verticalGuide('tailors', h)!
    expect(g.from).toEqual(h.center)
    expect(g.toY).toBeCloseTo(0.6, 5)
  })

  it('stays visible when the knees sit level with the center dot', () => {
    const h: Handles = {
      center: { x: 0.5, y: 0.7 },
      kneeL: { x: 0.3, y: 0.7 },
      kneeR: { x: 0.7, y: 0.7 },
    }
    // 90° each way: nothing above the center dot to reach for, but a plumb line
    // of zero length is what leaves the numbers unreadable.
    expect(verticalGuide('tailors', h)!.toY).toBeLessThan(0.7 - 0.1)
  })
})

describe('handlesFromLandmarks', () => {
  it('returns null for a short array', () => {
    expect(handlesFromLandmarks('split', [{ x: 0, y: 0 }])).toBeNull()
    expect(handlesFromLandmarks('tailors', [{ x: 0, y: 0 }])).toBeNull()
  })

  it('split: sets the hip handle to the hip midpoint', () => {
    const lms: Pt[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0 }))
    lms[POSE.LEFT_HIP] = { x: 0.4, y: 0.5 }
    lms[POSE.RIGHT_HIP] = { x: 0.6, y: 0.5 }
    lms[POSE.LEFT_ANKLE] = { x: 0.1, y: 0.6 }
    lms[POSE.RIGHT_ANKLE] = { x: 0.9, y: 0.6 }

    const h = handlesFromLandmarks('split', lms)
    expect(h).not.toBeNull()
    expect(h!.hip).toEqual({ x: 0.5, y: 0.5 })
  })

  it('rejects landmarks the detector says it could not see', () => {
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }))
    expect(handlesFromLandmarks('split', lms)).not.toBeNull()

    lms[POSE.LEFT_ANKLE] = { x: 0.1, y: 0.6, visibility: 0.1 }
    expect(handlesFromLandmarks('split', lms)).toBeNull()
  })

  it('tailors: needs both knees and both ankles seen', () => {
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }))
    expect(handlesFromLandmarks('tailors', lms)).not.toBeNull()

    lms[POSE.RIGHT_KNEE] = { x: 0.7, y: 0.8, visibility: 0.2 }
    expect(handlesFromLandmarks('tailors', lms)).toBeNull()
  })

  it('tailors: reads a mirrored photo onto the side the body calls left', () => {
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.9, visibility: 0.9 }))
    lms[POSE.LEFT_KNEE] = { x: 0.7, y: 0.8, visibility: 0.9 }
    lms[POSE.RIGHT_KNEE] = { x: 0.3, y: 0.8, visibility: 0.9 }

    expect(handlesFromLandmarks('tailors', lms)!.kneeL.x).toBe(0.7)
    // A front-camera shot flips the body, so the detector's "left knee" is the
    // knee the user calls right.
    expect(handlesFromLandmarks('tailors', lms, true)!.kneeL.x).toBe(0.3)
    expect(handlesFromLandmarks('tailors', lms, true)!.kneeR.x).toBe(0.7)
  })

  it('split: mirroring swaps the ankles but leaves the hip midpoint alone', () => {
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }))
    lms[POSE.LEFT_HIP] = { x: 0.4, y: 0.5, visibility: 0.9 }
    lms[POSE.RIGHT_HIP] = { x: 0.6, y: 0.5, visibility: 0.9 }
    lms[POSE.LEFT_ANKLE] = { x: 0.9, y: 0.6, visibility: 0.9 }
    lms[POSE.RIGHT_ANKLE] = { x: 0.1, y: 0.6, visibility: 0.9 }

    const h = handlesFromLandmarks('split', lms, true)!
    expect(h.hip).toEqual({ x: 0.5, y: 0.5 })
    expect(h.ankleL.x).toBe(0.1)
    expect(h.ankleR.x).toBe(0.9)
  })
})

describe('swapSides', () => {
  it('trades the two tailors knees, and reverses the logged angles with them', () => {
    const h: Handles = {
      center: { x: 0.5, y: 0.9 },
      kneeL: { x: 0.5, y: 0.6 },
      kneeR: { x: 0.2, y: 0.9 },
    }
    const before = anglesFromHandles('tailors', h, 0.75)
    const after = anglesFromHandles('tailors', swapSides('tailors', h), 0.75)
    expect(after.tailorsLeftDeg).toBe(before.tailorsRightDeg)
    expect(after.tailorsRightDeg).toBe(before.tailorsLeftDeg)
  })

  it('leaves the split alone — it has one angle across both legs', () => {
    expect(hasSides('split')).toBe(false)
    expect(hasSides('tailors')).toBe(true)
    const h = defaultHandles('split')
    expect(swapSides('split', h)).toBe(h)
  })
})

describe('summarizeResult', () => {
  it('formats split and tailors results', () => {
    expect(summarizeResult('split', { splitDeg: 92 })).toBe('92°')
    expect(summarizeResult('tailors', { tailorsLeftDeg: 55, tailorsRightDeg: 54 })).toBe('L 55° · R 54°')
  })
})

describe('the head-to-toe poses', () => {
  /** 33 landmarks, all confidently seen, at the same spot until overridden. */
  const lms = (): Landmark[] =>
    Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }))

  it('declares every handle its segments name, for every mode', () => {
    for (const mode of MEASURE_MODES) {
      const keys = new Set(HANDLES[mode].map((s) => s.key))
      const h = defaultHandles(mode)
      for (const spec of HANDLES[mode]) expect(h[spec.key]).toBeDefined()
      for (const seg of SEGMENTS[mode]) {
        expect(keys.has(seg.from)).toBe(true)
        expect(keys.has(seg.to)).toBe(true)
      }
    }
  })

  it('hands out a fresh copy of the defaults each time', () => {
    const a = defaultHandles('toe_touch')
    a.hip = { x: 0, y: 0 }
    expect(defaultHandles('toe_touch').hip).not.toEqual({ x: 0, y: 0 })
  })

  describe('toe_touch', () => {
    // Standing upright, side-on: the torso runs straight up from the hip and the
    // legs straight down, which is the widest the hip angle ever gets.
    it('reads 180° standing upright', () => {
      const h: Handles = {
        shoulder: { x: 0.5, y: 0.2 },
        hip: { x: 0.5, y: 0.5 },
        ankle: { x: 0.5, y: 0.9 },
      }
      expect(anglesFromHandles('toe_touch', h, 0.75).toeTouchDeg).toBeCloseTo(180, 0)
    })

    it('reads 90° folded to horizontal', () => {
      const h: Handles = {
        shoulder: { x: 0.1, y: 0.5 },
        hip: { x: 0.5, y: 0.5 },
        ankle: { x: 0.5, y: 0.9 },
      }
      expect(anglesFromHandles('toe_touch', h, 1).toeTouchDeg).toBeCloseTo(90, 0)
    })

    // Chest folded down onto the legs — the deep end of the pose, and the small
    // end of the number. This is the one reading where smaller is better.
    it('closes toward 0° as the fold deepens', () => {
      const upright = anglesFromHandles('toe_touch', {
        shoulder: { x: 0.5, y: 0.2 },
        hip: { x: 0.5, y: 0.5 },
        ankle: { x: 0.5, y: 0.9 },
      }, 1).toeTouchDeg!
      const deep = anglesFromHandles('toe_touch', {
        shoulder: { x: 0.5, y: 0.85 },
        hip: { x: 0.5, y: 0.5 },
        ankle: { x: 0.5, y: 0.9 },
      }, 1).toeTouchDeg!
      expect(deep).toBeLessThan(upright)
      expect(deep).toBeCloseTo(0, 0)
    })

    it('opens its arc at the hip, in the neutral color', () => {
      const h: Handles = {
        shoulder: { x: 0.1, y: 0.5 },
        hip: { x: 0.5, y: 0.5 },
        ankle: { x: 0.5, y: 0.9 },
      }
      const r = anglesFromHandles('toe_touch', h, 1)
      const marks = angleMarks('toe_touch', h, r)
      expect(marks).toHaveLength(1)
      expect(marks[0].vertex).toEqual(h.hip)
      expect(marks[0].role).toBe('ref')
      expect(marks[0].deg).toBe(r.toeTouchDeg)
    })

    it('places its handles on the body midlines', () => {
      const l = lms()
      l[POSE.LEFT_SHOULDER] = { x: 0.4, y: 0.3, visibility: 0.9 }
      l[POSE.RIGHT_SHOULDER] = { x: 0.6, y: 0.3, visibility: 0.9 }
      l[POSE.LEFT_HIP] = { x: 0.4, y: 0.5, visibility: 0.9 }
      l[POSE.RIGHT_HIP] = { x: 0.6, y: 0.5, visibility: 0.9 }
      l[POSE.LEFT_ANKLE] = { x: 0.45, y: 0.9, visibility: 0.9 }
      l[POSE.RIGHT_ANKLE] = { x: 0.55, y: 0.9, visibility: 0.9 }
      const h = handlesFromLandmarks('toe_touch', l)!
      expect(h.shoulder).toEqual({ x: 0.5, y: 0.3 })
      expect(h.hip).toEqual({ x: 0.5, y: 0.5 })
      expect(h.ankle).toEqual({ x: 0.5, y: 0.9 })
    })

    // Built from midpoints, so a mirror image is the same fold.
    it('measures a mirrored shot identically', () => {
      const l = lms()
      l[POSE.LEFT_SHOULDER] = { x: 0.3, y: 0.3, visibility: 0.9 }
      l[POSE.RIGHT_SHOULDER] = { x: 0.7, y: 0.3, visibility: 0.9 }
      expect(handlesFromLandmarks('toe_touch', l, true)).toEqual(
        handlesFromLandmarks('toe_touch', l, false),
      )
    })

    it('needs the shoulders as well as the hips and ankles', () => {
      const l = lms()
      expect(handlesFromLandmarks('toe_touch', l)).not.toBeNull()
      l[POSE.LEFT_SHOULDER] = { x: 0.4, y: 0.3, visibility: 0.1 }
      expect(handlesFromLandmarks('toe_touch', l)).toBeNull()
    })
  })

  describe('leg_lift_left / leg_lift_right', () => {
    const lifted: Handles = {
      hip: { x: 0.5, y: 0.5 },
      ankleStand: { x: 0.5, y: 0.9 },
      ankleLift: { x: 0.1, y: 0.5 },
    }

    it('reads the angle between the two legs, 0° with both down', () => {
      expect(anglesFromHandles('leg_lift_left', lifted, 1).legLiftLeftDeg).toBeCloseTo(90, 0)
      const down = { ...lifted, ankleLift: { x: 0.5, y: 0.85 } }
      expect(anglesFromHandles('leg_lift_left', down, 1).legLiftLeftDeg).toBeCloseTo(0, 0)
    })

    it('opens wider as the leg comes up — bigger is better here', () => {
      const low = anglesFromHandles('leg_lift_left', {
        ...lifted,
        ankleLift: { x: 0.2, y: 0.8 },
      }, 1).legLiftLeftDeg!
      expect(anglesFromHandles('leg_lift_left', lifted, 1).legLiftLeftDeg!).toBeGreaterThan(low)
    })

    it('writes to the field its own side names, and nothing else', () => {
      expect(anglesFromHandles('leg_lift_left', lifted, 1)).toEqual({
        legLiftLeftDeg: expect.any(Number),
      })
      expect(anglesFromHandles('leg_lift_right', lifted, 1)).toEqual({
        legLiftRightDeg: expect.any(Number),
      })
    })

    it('colors each side’s arc as its own line, opening at the hip', () => {
      const [left] = angleMarks('leg_lift_left', lifted, { legLiftLeftDeg: 90 })
      const [right] = angleMarks('leg_lift_right', lifted, { legLiftRightDeg: 90 })
      expect(left.vertex).toEqual(lifted.hip)
      expect(left.role).toBe('a')
      expect(right.role).toBe('b')
    })

    it('takes the lifted ankle from its own side and the standing one from the other', () => {
      const l = lms()
      l[POSE.LEFT_HIP] = { x: 0.4, y: 0.5, visibility: 0.9 }
      l[POSE.RIGHT_HIP] = { x: 0.6, y: 0.5, visibility: 0.9 }
      l[POSE.LEFT_ANKLE] = { x: 0.2, y: 0.5, visibility: 0.9 }
      l[POSE.RIGHT_ANKLE] = { x: 0.6, y: 0.9, visibility: 0.9 }

      const left = handlesFromLandmarks('leg_lift_left', l)!
      expect(left.hip).toEqual({ x: 0.5, y: 0.5 })
      expect(left.ankleLift).toEqual({ x: 0.2, y: 0.5 })
      expect(left.ankleStand).toEqual({ x: 0.6, y: 0.9 })

      const right = handlesFromLandmarks('leg_lift_right', l)!
      expect(right.ankleLift).toEqual({ x: 0.6, y: 0.9 })
      expect(right.ankleStand).toEqual({ x: 0.2, y: 0.5 })
    })

    it('reads a mirrored shot onto the leg the body calls lifted', () => {
      const l = lms()
      l[POSE.LEFT_ANKLE] = { x: 0.2, y: 0.5, visibility: 0.9 }
      l[POSE.RIGHT_ANKLE] = { x: 0.6, y: 0.9, visibility: 0.9 }
      const h = handlesFromLandmarks('leg_lift_left', l, true)!
      expect(h.ankleLift).toEqual({ x: 0.6, y: 0.9 })
      expect(h.ankleStand).toEqual({ x: 0.2, y: 0.5 })
    })
  })

  // You can only lift one leg per photo, so the side is the shot rather than a
  // pair within it — which leaves nothing for the editor's swap control to trade.
  it('offers no side swap on any of the three', () => {
    for (const mode of ['toe_touch', 'leg_lift_left', 'leg_lift_right'] as const) {
      expect(hasSides(mode)).toBe(false)
      const h = defaultHandles(mode)
      expect(swapSides(mode, h)).toBe(h)
      expect(VERTICAL_REF[mode]).toBeNull()
      expect(verticalGuide(mode, h)).toBeNull()
    }
  })

  it('summarises each as its one reading', () => {
    expect(summarizeResult('toe_touch', { toeTouchDeg: 96 })).toBe('96°')
    expect(summarizeResult('leg_lift_left', { legLiftLeftDeg: 84 })).toBe('84°')
    expect(summarizeResult('leg_lift_right', { legLiftRightDeg: 80 })).toBe('80°')
  })

  it('names every reading the editor spells out', () => {
    for (const mode of MEASURE_MODES) {
      const rs = resultReadings(mode, anglesFromHandles(mode, defaultHandles(mode), 0.75))
      expect(rs.length).toBeGreaterThan(0)
      for (const r of rs) {
        expect(r.label).not.toBe('')
        expect(Number.isFinite(r.deg)).toBe(true)
      }
    }
  })
})
