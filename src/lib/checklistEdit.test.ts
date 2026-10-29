import { describe, expect, it } from 'vitest'
import { checklistSetEdit } from './checklistEdit'
import type { SetLog } from '../types'

const pending: SetLog = { setNumber: 2, weightLbs: 50, reps: 8, done: false }

describe('checklistSetEdit', () => {
  it('marks a set done when a number is typed into it', () => {
    expect(checklistSetEdit(pending, { reps: 6 }).patch).toEqual({ reps: 6, done: true })
    expect(checklistSetEdit(pending, { weightLbs: 55 }).patch).toEqual({ weightLbs: 55, done: true })
  })

  it('carries the typed number together with the prefill it was typed beside', () => {
    expect(checklistSetEdit(pending, { reps: 6 }).carried).toEqual({ weightLbs: 50, reps: 6 })
    expect(checklistSetEdit(pending, { weightLbs: 55 }).carried).toEqual({ weightLbs: 55, reps: 8 })
  })

  it('carries a cleared weight as none rather than undefined', () => {
    expect(checklistSetEdit(pending, { weightLbs: null }).carried).toEqual({ weightLbs: null, reps: 8 })
  })

  it('leaves a set already done as done', () => {
    expect(checklistSetEdit({ ...pending, done: true }, { reps: 10 }).patch.done).toBe(true)
  })
})
