import { describe, expect, it } from 'vitest'
import { coachStarters } from './coachStarters'
import type { Profile } from './profile'

const tracking = (...pillars: Profile['pillars']) => ({ pillars }) as Profile

describe('coachStarters', () => {
  it('asks about what the person tracks, three at most', () => {
    expect(coachStarters(tracking('strength', 'flexibility', 'cardio', 'diet'))).toEqual([
      'how is my strength progressing?',
      'am i eating enough to hit my goal?',
      'what should i focus on this week?',
    ])
    expect(coachStarters(tracking('cardio'))).toEqual(['how is my cardio going?', 'what should i focus on this week?'])
  })
})
