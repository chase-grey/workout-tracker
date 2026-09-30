import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FlossGuide } from './FlossGuide'
import { RhythmGuide } from './RhythmGuide'

afterEach(() => vi.unstubAllGlobals())

function setup(reduced = false) {
  vi.stubGlobal('window', { matchMedia: () => ({ matches: reduced }) })
}

describe('sciatic floss direction cues', () => {
  it('travels forward then back without jumping at the turn or rep boundary', () => {
    setup()
    const frame = (phaseIndex: number, progress: number) =>
      renderToStaticMarkup(createElement(FlossGuide, { phaseIndex, progress, seconds: 3 }))
    expect(frame(0, 0)).toContain('move forward')
    expect(frame(0, 0)).toContain('left:10%')
    expect(frame(0, 1)).toContain('left:90%')
    expect(frame(1, 0)).toContain('move back')
    expect(frame(1, 0)).toContain('left:90%')
    expect(frame(1, 1)).toContain('left:10%')
    expect(frame(0, 0.25)).toContain('left:30%')
    expect(frame(1, 0.25)).toContain('left:70%')
  })

  it('keeps readable direction cues with reduced motion', () => {
    setup(true)
    const forward = renderToStaticMarkup(createElement(FlossGuide, { phaseIndex: 0, progress: 0.5, seconds: 3 }))
    const back = renderToStaticMarkup(createElement(FlossGuide, { phaseIndex: 1, progress: 0.5, seconds: 3 }))
    expect(forward).toContain('move forward')
    expect(forward).toContain('left:90%')
    expect(back).toContain('move back')
    expect(back).toContain('left:10%')
  })

  it.each(['3s up · 3s down', '3s forward · 3s back'])(
    'uses directional guidance for saved and current floss tempos: %s', (tempo) => {
      setup()
      expect(renderToStaticMarkup(createElement(RhythmGuide, { tempo, forwardBack: true }))).toContain('move forward')
      expect(renderToStaticMarkup(createElement(RhythmGuide, { tempo }))).not.toContain('move forward')
    },
  )
})
