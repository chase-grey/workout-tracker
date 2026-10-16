import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlossGuide } from './FlossGuide'
import { RhythmGuide } from './RhythmGuide'

afterEach(() => vi.unstubAllGlobals())

function setup(reduced = false) {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) })
}

const frame = (phaseIndex: number, progress: number) =>
  renderToStaticMarkup(createElement(FlossGuide, { phaseIndex, progress, seconds: 3 }))

/** Where the crest sits — the glow that travels with it. */
const crestLeft = (html: string) => Number(html.match(/blur-2xl" style="left:([\d.]+)%/)?.[1])

describe('sciatic floss direction cues', () => {
  it('travels forward then back without jumping at the turn or rep boundary', () => {
    setup()
    expect(frame(0, 0)).toContain('data-direction="forward"')
    expect(crestLeft(frame(0, 0))).toBeCloseTo(12)
    expect(crestLeft(frame(0, 0.5))).toBeCloseTo(50)
    expect(crestLeft(frame(0, 1))).toBeCloseTo(88)
    expect(frame(1, 0)).toContain('data-direction="back"')
    expect(crestLeft(frame(1, 0))).toBeCloseTo(88)
    expect(crestLeft(frame(1, 1))).toBeCloseTo(12)
  })

  it('turns and loops without a bead jumping', () => {
    setup()
    const beads = (html: string) => html.split('rounded-full bg-current"').slice(1)
    const seam = (a: string, b: string) => {
      const [x, y] = [beads(a), beads(b)]
      expect(x).toHaveLength(13)
      x.forEach((bead, k) => {
        const nums = (s: string) => (s.match(/[\d.]+/g) ?? []).map(Number)
        nums(bead).forEach((n, j) => expect(n).toBeCloseTo(nums(y[k])[j], 2))
      })
    }
    seam(frame(0, 0.9999), frame(1, 0.0001))
    seam(frame(1, 0.9999), frame(0, 0.0001))
  })

  it('puts no words on screen', () => {
    setup()
    for (const html of [frame(0, 0.3), frame(1, 0.7)]) {
      expect(html.replace(/<[^>]*>/g, '')).toBe('')
    }
  })

  it('draws the two directions differently', () => {
    setup()
    expect(frame(0, 0.5)).not.toBe(frame(1, 0.5))
  })

  it('parks the crest at the end it is heading to with reduced motion', () => {
    setup(true)
    expect(crestLeft(frame(0, 0.5))).toBeCloseTo(88)
    expect(crestLeft(frame(1, 0.5))).toBeCloseTo(12)
  })

  it.each(['3s up · 3s down', '3s forward · 3s back'])(
    'uses directional guidance for saved and current floss tempos: %s', (tempo) => {
      setup()
      expect(renderToStaticMarkup(createElement(RhythmGuide, { tempo, forwardBack: true }))).toContain('data-direction')
      expect(renderToStaticMarkup(createElement(RhythmGuide, { tempo }))).not.toContain('data-direction')
    },
  )
})
