import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlossGuide } from './FlossGuide'
import { RhythmGuide } from './RhythmGuide'
import type { FlossVariant } from '../lib/rhythmVariant'

afterEach(() => vi.unstubAllGlobals())

function setup(reduced = false) {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) })
}

/** The figures that glide across the frame, forward being right. */
const ACROSS: readonly FlossVariant[] = ['beads', 'thread', 'wake', 'grass', 'slats', 'tiles', 'capsule']
/** The figures that run up it, forward being toward the top of the phone. */
const UPWARD: readonly FlossVariant[] = ['kite', 'helix', 'fill', 'scan']
const FIGURES: readonly FlossVariant[] = [...ACROSS, ...UPWARD]

const frame = (phaseIndex: number, progress: number, variant: FlossVariant = 'beads') =>
  renderToStaticMarkup(createElement(FlossGuide, { phaseIndex, progress, seconds: 3, variant }))

/** Where the crest sits — the glow that travels with it, in every figure. */
const crestLeft = (html: string) => Number(html.match(/blur-2xl" style="left:([\d.]+)%/)?.[1])
const crestTop = (html: string) => Number(html.match(/blur-2xl" style="left:[\d.]+%;top:([\d.]+)%/)?.[1])
/** How far along the run the crest is, whichever way the figure lays the run out. */
const crestAlong = (html: string, figure: FlossVariant) =>
  UPWARD.includes(figure) ? 100 - crestTop(html) : crestLeft(html)

/** Every number in the markup, in order: positions, sizes, opacities, path points. */
const numbers = (html: string) => (html.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)

describe.each(FIGURES)('sciatic floss figure: %s', (figure) => {
  it('travels forward then back', () => {
    setup()
    const along = (phaseIndex: number, progress: number) => crestAlong(frame(phaseIndex, progress, figure), figure)
    expect(frame(0, 0, figure)).toContain('data-direction="forward"')
    expect(along(0, 0)).toBeCloseTo(12)
    expect(along(0, 0.5)).toBeCloseTo(50)
    expect(along(0, 1)).toBeCloseTo(88)
    expect(frame(1, 0, figure)).toContain('data-direction="back"')
    expect(along(1, 0)).toBeCloseTo(88)
    expect(along(1, 1)).toBeCloseTo(12)
  })

  it('turns and loops without anything jumping', () => {
    setup()
    // The frame either side of the turn, and of the rep boundary. Whatever is
    // still moving at the turn (a wake trailing behind) moves by a hair across
    // this gap; a figure that trades sides on the flip moves by whole percents.
    const seam = (a: string, b: string) => {
      const [x, y] = [numbers(a), numbers(b)]
      expect(x.length).toBeGreaterThan(20)
      expect(x).toHaveLength(y.length)
      x.forEach((n, j) => expect(n).toBeCloseTo(y[j], 1))
    }
    seam(frame(0, 0.9999, figure), frame(1, 0.0001, figure))
    seam(frame(1, 0.9999, figure), frame(0, 0.0001, figure))
  })

  it('puts no words on screen', () => {
    setup()
    for (const html of [frame(0, 0.3, figure), frame(1, 0.7, figure)]) {
      expect(html.replace(/<[^>]*>/g, '')).toBe('')
    }
  })

  it('draws the two directions differently', () => {
    setup()
    expect(frame(0, 0.5, figure)).not.toBe(frame(1, 0.5, figure))
  })

  it('parks the crest at the end it is heading to with reduced motion', () => {
    setup(true)
    expect(crestAlong(frame(0, 0.5, figure), figure)).toBeCloseTo(88)
    expect(crestAlong(frame(1, 0.5, figure), figure)).toBeCloseTo(12)
    expect(frame(0, 0.5, figure)).not.toBe(frame(1, 0.5, figure))
  })
})

describe.each(ACROSS)('across-the-frame figure: %s', (figure) => {
  it('goes right on forward and left on back, holding the midline', () => {
    setup()
    expect(frame(0, 0.5, figure)).toContain('data-axis="horizontal"')
    expect(crestLeft(frame(0, 1, figure))).toBeCloseTo(88)
    expect(crestLeft(frame(1, 1, figure))).toBeCloseTo(12)
  })
})

describe.each(UPWARD)('up-the-phone figure: %s', (figure) => {
  it('climbs toward the top of the phone on forward and sinks on back, holding the centre line', () => {
    setup()
    expect(frame(0, 0.5, figure)).toContain('data-axis="vertical"')
    const start = frame(0, 0, figure)
    const end = frame(0, 1, figure)
    expect(crestTop(start)).toBeCloseTo(88)
    expect(crestTop(end)).toBeCloseTo(12)
    expect(crestTop(frame(1, 1, figure))).toBeCloseTo(88)
    expect(crestLeft(start)).toBeCloseTo(50)
    expect(crestLeft(end)).toBeCloseTo(50)
  })
})

describe('the floss figures', () => {
  it('are each their own picture', () => {
    setup()
    const frames = FIGURES.map((figure) => frame(0, 0.5, figure))
    expect(new Set(frames).size).toBe(FIGURES.length)
    FIGURES.forEach((figure, k) => expect(frames[k]).toContain(`data-variant="${figure}"`))
  })

  it('draw the beads for a shape from another family', () => {
    setup()
    expect(renderToStaticMarkup(createElement(FlossGuide, { phaseIndex: 0, progress: 0.5, seconds: 3, variant: 'orb' })))
      .toContain('data-variant="beads"')
  })

  it.each(['3s up · 3s down', '3s forward · 3s back'])(
    'pace saved and current floss tempos, in the figure the session chose: %s', (tempo) => {
      setup()
      const guide = renderToStaticMarkup(createElement(RhythmGuide, { tempo, forwardBack: true, variant: 'thread' }))
      expect(guide).toContain('data-direction')
      expect(guide).toContain('data-variant="thread"')
      expect(renderToStaticMarkup(createElement(RhythmGuide, { tempo }))).not.toContain('data-direction')
    },
  )
})
