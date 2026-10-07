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

/** Where the orb sits — the only element scaled as it travels. */
const orbLeft = (html: string) => Number(html.match(/left:([\d.]+)%;transform:translate\(-50%, -50%\) scale/)?.[1])

describe('sciatic floss direction cues', () => {
  it('travels forward then back without jumping at the turn or rep boundary', () => {
    setup()
    expect(frame(0, 0)).toContain('data-direction="forward"')
    expect(orbLeft(frame(0, 0))).toBeCloseTo(12)
    expect(orbLeft(frame(0, 0.5))).toBeCloseTo(50)
    expect(orbLeft(frame(0, 1))).toBeCloseTo(88)
    expect(frame(1, 0)).toContain('data-direction="back"')
    expect(orbLeft(frame(1, 0))).toBeCloseTo(88)
    expect(orbLeft(frame(1, 1))).toBeCloseTo(12)
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

  it('parks at the end it is heading to with reduced motion', () => {
    setup(true)
    expect(orbLeft(frame(0, 0.5))).toBeCloseTo(88)
    expect(orbLeft(frame(1, 0.5))).toBeCloseTo(12)
  })

  it.each(['3s up · 3s down', '3s forward · 3s back'])(
    'uses directional guidance for saved and current floss tempos: %s', (tempo) => {
      setup()
      expect(renderToStaticMarkup(createElement(RhythmGuide, { tempo, forwardBack: true }))).toContain('data-direction')
      expect(renderToStaticMarkup(createElement(RhythmGuide, { tempo }))).not.toContain('data-direction')
    },
  )
})
