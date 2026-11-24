import { describe, expect, it } from 'vitest'
import {
  BOXES_MAX,
  TEXT_LINE_MAX,
  TEXT_LINES_MAX,
  boxesOutside,
  textLines,
  trimFacts,
  type ScreenFacts,
} from './screenReport'

const facts = (over: Partial<ScreenFacts> = {}): ScreenFacts => ({
  screen: 'stretch session',
  userAgent: 'Mozilla/5.0 (Android 15; Mobile; rv:160.0) Gecko/160.0 Firefox/160.0',
  inner: { w: 390, h: 760 },
  visual: { w: 390, h: 760, top: 0, left: 0, scale: 1 },
  device: { w: 390, h: 844, dpr: 2.75 },
  display: 'standalone',
  mode: 'dark',
  reducedMotion: false,
  tab: null,
  animations: ['rhythm:anvil'],
  boxes: [],
  scroll: null,
  text: [],
  ...over,
})

describe('textLines', () => {
  it('drops blank lines and closes up whitespace', () => {
    expect(textLines('pike lift\n\n   rep 2   of 5 \n')).toEqual(['pike lift', 'rep 2 of 5'])
  })

  it('cuts a long line and says how many lines were left off', () => {
    const long = 'x'.repeat(TEXT_LINE_MAX + 40)
    const many = Array.from({ length: TEXT_LINES_MAX + 7 }, (_, i) => `line ${i}`).join('\n')
    expect(textLines(long)[0]).toHaveLength(TEXT_LINE_MAX)
    const lines = textLines(many)
    expect(lines).toHaveLength(TEXT_LINES_MAX + 1)
    expect(lines[lines.length - 1]).toBe('… 7 more lines')
  })
})

describe('trimFacts', () => {
  it('rounds boxes to a tenth of a pixel and keeps no more than fit', () => {
    const boxes = Array.from({ length: BOXES_MAX + 5 }, (_, i) => ({
      name: `b${i}`,
      box: { x: 0.04, y: 12.3456, w: 390.06, h: 100 },
    }))
    const out = trimFacts(facts({ boxes }))
    expect(out.boxes).toHaveLength(BOXES_MAX)
    expect(out.boxes[0].box).toEqual({ x: 0, y: 12.3, w: 390.1, h: 100 })
  })

  it('stays well inside the cell the backend keeps it in', () => {
    const text = Array.from({ length: 500 }, () => 'y'.repeat(400))
    const boxes = Array.from({ length: 200 }, (_, i) => ({ name: `.some-long-class-name-${i}`, box: { x: 1, y: 2, w: 3, h: 4 } }))
    expect(JSON.stringify(trimFacts(facts({ text, boxes }))).length).toBeLessThan(20000)
  })
})

describe('boxesOutside', () => {
  it('names the boxes that run past the viewport, and not the ones inside it', () => {
    const out = boxesOutside(
      facts({
        boxes: [
          { name: 'main', box: { x: 0, y: 0, w: 390, h: 700 } },
          { name: '.rhythm-shape', box: { x: 20, y: 500, w: 350, h: 350 } },
          { name: 'nav', box: { x: 0, y: 700, w: 390, h: 60 } },
          { name: 'hidden', box: { x: 900, y: 900, w: 0, h: 0 } },
        ],
      }),
    )
    expect(out).toEqual(['.rhythm-shape'])
  })
})
