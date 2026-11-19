import { describe, expect, it } from 'vitest'
import { screenMove, screenMoveKeyframes } from './motion'

const TABS = ['today', 'progress', 'coach', 'settings']
const on = (tab: string, immersive = false, session = immersive) => ({ tab, immersive, session })

describe('screenMove', () => {
  it('brings a tab in from the side the thumb moved toward', () => {
    expect(screenMove(on('today'), on('progress'), TABS)).toBe('right')
    expect(screenMove(on('settings'), on('today'), TABS)).toBe('left')
  })

  it('does nothing when the screen is the one already showing', () => {
    expect(screenMove(on('today'), on('today'), TABS)).toBeNull()
  })

  it('follows the bar as it is drawn, with the coach switched off', () => {
    const bar = TABS.filter((t) => t !== 'coach')
    expect(screenMove(on('progress'), on('settings'), bar)).toBe('right')
    // Settings sends you to a coach tab the bar doesn't have yet.
    expect(screenMove(on('settings'), on('coach'), bar)).toBe('right')
  })

  it('raises a session over the tabs and settles the tabs when it leaves', () => {
    expect(screenMove(on('today'), on('today', true), TABS)).toBe('rise')
    // Set aside, the session is still running; coming back to it is a return.
    expect(screenMove(on('today', true), on('today', false, true), TABS)).toBe('settle')
    expect(screenMove(on('progress', false, true), on('progress', true), TABS)).toBe('return')
    expect(screenMove(on('today', true), on('today'), TABS)).toBe('settle')
    // A recap closing lands on Today whatever tab the session started from.
    expect(screenMove(on('progress', true), on('today'), TABS)).toBe('settle')
  })

  it('leaves a tab that changes behind a session alone', () => {
    expect(screenMove(on('progress', true), on('today', true), TABS)).toBeNull()
  })
})

describe('screenMoveKeyframes', () => {
  it('ends every move at rest, so nothing is left transformed', () => {
    for (const move of ['left', 'right', 'rise', 'return', 'settle'] as const) {
      const frames = screenMoveKeyframes(move)
      expect(frames.at(-1)).toEqual({ opacity: 1, transform: 'none' })
      expect(Object.keys(frames[0]).sort()).toEqual(['opacity', 'transform'])
    }
  })
})

describe('a session starting', () => {
  it('travels without fading, since the session fades itself in', () => {
    expect(screenMoveKeyframes('rise')[0].opacity).toBe(1)
    expect(screenMoveKeyframes('return')[0].opacity).toBe(0)
  })
})
