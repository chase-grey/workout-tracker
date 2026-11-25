import { describe, expect, it } from 'vitest'
import { unbroken } from './unbroken'

describe('unbroken', () => {
  it('leaves a fact nowhere to wrap', () => {
    expect(unbroken('set 2 of 2')).toBe('set\u00a02\u00a0of\u00a02')
    expect(unbroken('set 2 of 2')).not.toMatch(/ /)
  })

  it('leaves a line of facts wrapping only between them', () => {
    const line = ['rectus femoris stretch', unbroken('set 2 of 2')].join(' · ')
    expect(line.split(' ').at(-1)).toBe('set\u00a02\u00a0of\u00a02')
  })
})
