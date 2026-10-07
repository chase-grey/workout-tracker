import { describe, expect, it } from 'vitest'
import { animationId, unionHidden, withHidden } from './hiddenAnimations'

describe('hiddenAnimations', () => {
  it('keeps families apart where names repeat', () => {
    expect(animationId('rest', 'tide')).not.toBe(animationId('rhythm', 'tide'))
  })

  it('adds an id once', () => {
    expect(withHidden(undefined, 'rest:tide')).toEqual(['rest:tide'])
    expect(withHidden(['rest:tide'], 'rest:tide')).toEqual(['rest:tide'])
  })

  it('unions two devices without losing either side', () => {
    expect(unionHidden(['rest:moon'], ['rhythm:orb', 'rest:moon'])).toEqual(['rest:moon', 'rhythm:orb'])
    expect(unionHidden(undefined, undefined)).toBeUndefined()
  })
})
