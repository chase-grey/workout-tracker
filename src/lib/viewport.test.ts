import { describe, expect, it } from 'vitest'
import { foldKeyboard } from './viewport'

/** Feed a run of measurements through the fold, returning every `open` reading. */
function run(samples: { width: number; visible: number }[]): boolean[] {
  let state = { width: 0, rest: 0 }
  return samples.map((s) => {
    const next = foldKeyboard(state, s)
    state = { width: next.width, rest: next.rest }
    return next.open
  })
}

describe('foldKeyboard', () => {
  it('starts closed — the first measurement is the resting height', () => {
    expect(run([{ width: 390, visible: 844 }])).toEqual([false])
  })

  it('opens when the visible height drops by a keyboard', () => {
    expect(
      run([
        { width: 390, visible: 844 },
        { width: 390, visible: 500 },
      ]),
    ).toEqual([false, true])
  })

  it('closes again when the height comes back', () => {
    expect(
      run([
        { width: 390, visible: 844 },
        { width: 390, visible: 500 },
        { width: 390, visible: 844 },
      ]),
    ).toEqual([false, true, false])
  })

  // Android shrinks the layout viewport in step with the visual one, so the two
  // stay equal and only the drop from rest gives the keyboard away.
  it('opens on a partial slide-in and stays open once the keyboard settles', () => {
    expect(
      run([
        { width: 390, visible: 844 },
        { width: 390, visible: 700 },
        { width: 390, visible: 520 },
      ]),
    ).toEqual([false, true, true])
  })

  // The URL bar hiding on scroll takes a chunk out of the viewport too — much
  // less than a keyboard, and it must not read as one.
  it('ignores a browser chrome sized change', () => {
    expect(
      run([
        { width: 390, visible: 844 },
        { width: 390, visible: 788 },
      ]),
    ).toEqual([false, false])
  })

  it('re-bases on rotation rather than reading landscape as a keyboard', () => {
    expect(
      run([
        { width: 390, visible: 844 },
        { width: 844, visible: 390 },
      ]),
    ).toEqual([false, false])
  })

  it('still finds the keyboard after a rotation', () => {
    expect(
      run([
        { width: 390, visible: 844 },
        { width: 844, visible: 390 },
        { width: 844, visible: 200 },
      ]),
    ).toEqual([false, false, true])
  })

  // A keyboard dismissed while the URL bar is hidden leaves the viewport a little
  // short of the tallest ever seen; that remembered rest must not keep it "open".
  it('holds the tallest height seen as rest', () => {
    expect(
      run([
        { width: 390, visible: 844 },
        { width: 390, visible: 900 },
        { width: 390, visible: 844 },
      ]),
    ).toEqual([false, false, false])
  })
})
