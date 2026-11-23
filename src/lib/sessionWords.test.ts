import { describe, expect, it } from 'vitest'
import { finishEarlyPrompt, loadWord } from './sessionWords'

describe('loadWord', () => {
  it('names the number by what the exercise is loaded with', () => {
    expect(loadWord({})).toBe('lbs')
    expect(loadWord({ stackSetting: true })).toBe('setting')
    expect(loadWord({ bodyweight: true })).toBe('added lbs')
  })
})

describe('finishEarlyPrompt', () => {
  it('asks only while sets are still owed', () => {
    expect(finishEarlyPrompt(27, 28)).toBe('finish and log with 1 set left?')
    expect(finishEarlyPrompt(1, 28)).toBe('finish and log with 27 sets left?')
    expect(finishEarlyPrompt(28, 28)).toBeNull()
    expect(finishEarlyPrompt(30, 28)).toBeNull()
  })
})
