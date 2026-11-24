import { describe, expect, it } from 'vitest'
import { labelAnchors, tagWidth } from './handleLabels'
import { HANDLES, MEASURE_MODES, defaultHandles } from './measure'

describe('labelAnchors', () => {
  const tilt = HANDLES.pelvic_tilt

  it('runs two close dots’ names away from each other, whichever way the body faces', () => {
    const right = labelAnchors({ back: { x: 0.42, y: 0.5 }, front: { x: 0.58, y: 0.51 } }, tilt, 360)
    expect(right).toEqual({ back: 'end', front: 'start' })
    const left = labelAnchors({ back: { x: 0.58, y: 0.5 }, front: { x: 0.42, y: 0.51 } }, tilt, 360)
    expect(left).toEqual({ back: 'start', front: 'end' })
  })

  it('sets a dot in the middle of the group astride its name', () => {
    const a = labelAnchors(defaultHandles('split'), HANDLES.split, 360)
    expect(a.hip).toBe('center')
  })

  it('turns a name round rather than run it off the photo', () => {
    // The split's ankles sit near the edges: outward is off the frame.
    const a = labelAnchors(defaultHandles('split'), HANDLES.split, 360)
    expect(a.ankleL).toBe('start')
    expect(a.ankleR).toBe('end')
  })

  it('keeps every pose’s names on the photo where it opens, at a phone’s width', () => {
    const width = 320
    for (const mode of MEASURE_MODES) {
      const h = defaultHandles(mode)
      const anchors = labelAnchors(h, HANDLES[mode], width)
      for (const spec of HANDLES[mode]) {
        const x = h[spec.key].x * width
        const w = tagWidth(spec.label)
        const [from, to] =
          anchors[spec.key] === 'start'
            ? [x - 14, x - 14 + w]
            : anchors[spec.key] === 'end'
              ? [x + 14 - w, x + 14]
              : [x - w / 2, x + w / 2]
        expect(from, `${mode} ${spec.key}`).toBeGreaterThanOrEqual(0)
        expect(to, `${mode} ${spec.key}`).toBeLessThanOrEqual(width)
      }
    }
  })

  it('lets a narrow photo’s names run out into the space beside it', () => {
    const h = { back: { x: 0.58, y: 0.5 }, front: { x: 0.42, y: 0.51 } }
    // A 9:16 photo fitted to a short screen: 200px wide, 80px clear each side.
    expect(labelAnchors(h, tilt, 200)).not.toEqual({ back: 'start', front: 'end' })
    expect(labelAnchors(h, tilt, 200, 80)).toEqual({ back: 'start', front: 'end' })
  })

  it('leaves out a dot that isn’t placed', () => {
    expect(labelAnchors({ back: { x: 0.5, y: 0.5 } }, tilt, 360)).toEqual({ back: 'center' })
  })
})
