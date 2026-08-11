import { describe, it, expect } from 'vitest'
import { FLEX_ROUTINE } from '../config/flexPlan'
import { applyFlexEdits, type FlexEdit } from './flexTools'

describe('applyFlexEdits', () => {
  it('setExercise changes valid fields and guards invalid ones', () => {
    const edits: FlexEdit[] = [
      {
        op: 'setExercise',
        block: 'pancake',
        key: 'pancake_hang',
        fields: { reps: 10, name: 'Pancake Reach', restSec: -5 },
      },
    ]
    const { routine, applied, errors } = applyFlexEdits(FLEX_ROUTINE, edits)
    const block = routine.find((b) => b.label === 'pancake')!
    const ex = block.exercises.find((e) => e.key === 'pancake_hang')!
    expect(ex.reps).toBe(10)
    expect(ex.name).toBe('Pancake Reach')
    expect(ex.restSec).toBe(90) // invalid negative ignored, keeps original
    expect(applied.some((m) => m.includes('reps'))).toBe(true)
    expect(errors.some((m) => m.includes('restSec'))).toBe(true)
  })

  it('setExercise keeps the name when handed a blank one, but allows a blank tempo', () => {
    const { routine, errors } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'setExercise', block: 'pancake', key: 'pancake_hang', fields: { name: '  ', tempo: '' } },
    ])
    const ex = routine
      .find((b) => b.label === 'pancake')!
      .exercises.find((e) => e.key === 'pancake_hang')!
    expect(ex.name).toBe('pancake hang')
    expect(ex.tempo).toBe('')
    expect(errors.some((m) => m.includes('name'))).toBe(true)
  })

  it('setExercise errors when block or exercise missing', () => {
    const { errors: e1 } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'setExercise', block: 'Nope', key: 'x', fields: { reps: 5 } },
    ])
    expect(e1.some((m) => m.includes('not found'))).toBe(true)

    const { errors: e2 } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'setExercise', block: 'pancake', key: 'ghost', fields: { reps: 5 } },
    ])
    expect(e2.some((m) => m.includes('ghost'))).toBe(true)
  })

  it('matches blocks case-insensitively and trimmed', () => {
    const { applied } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'setBlockNote', block: '  pancake  ', note: 'hi' },
    ])
    expect(applied.some((m) => m.includes('pancake'))).toBe(true)
  })

  it('addExercise slugs name into key and defaults missing fields', () => {
    const { routine, applied } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'addExercise', block: 'pancake', exercise: { name: 'Frog Stretch!!' } },
    ])
    const block = routine.find((b) => b.label === 'pancake')!
    const ex = block.exercises.find((e) => e.name === 'Frog Stretch!!')!
    expect(ex.key).toBe('frog_stretch')
    expect(ex.sets).toBe('3')
    expect(ex.maxSets).toBe(3)
    expect(ex.reps).toBe(8)
    expect(ex.tempo).toBe('')
    expect(ex.restSec).toBe(90)
    expect(applied.some((m) => m.includes('Frog Stretch!!'))).toBe(true)
  })

  it('addExercise appends _2 on key collision', () => {
    const { routine } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'addExercise', block: 'pancake', exercise: { name: 'pancake hang' } },
    ])
    const block = routine.find((b) => b.label === 'pancake')!
    expect(block.exercises.map((e) => e.key)).toContain('pancake_hang')
    expect(block.exercises.map((e) => e.key)).toContain('pancake_hang_2')
  })

  it('addExercise names off the key when the name is missing or blank', () => {
    const { routine } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'addExercise', block: 'pancake', exercise: { key: 'butterfly' } as never },
      { op: 'addExercise', block: 'pancake', exercise: { key: 'seated_straddle', name: ' ' } },
    ])
    const block = routine.find((b) => b.label === 'pancake')!
    const named = (key: string) => block.exercises.find((e) => e.key === key)!.name
    expect(named('butterfly')).toBe('butterfly')
    // Spaced out rather than shown as the raw slug it's stored under.
    expect(named('seated_straddle')).toBe('seated straddle')
  })

  it('addExercise errors when block missing', () => {
    const { errors } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'addExercise', block: 'Nope', exercise: { name: 'X' } },
    ])
    expect(errors.some((m) => m.includes('not found'))).toBe(true)
  })

  it('removeExercise removes by key and errors when missing', () => {
    const { routine, applied } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'removeExercise', block: 'adductor superset', key: 'horse_squat' },
    ])
    const block = routine.find((b) => b.label === 'adductor superset')!
    expect(block.exercises.map((e) => e.key)).not.toContain('horse_squat')
    expect(applied.some((m) => m.includes('horse squat'))).toBe(true)

    const { errors } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'removeExercise', block: 'adductor superset', key: 'ghost' },
    ])
    expect(errors.some((m) => m.includes('ghost'))).toBe(true)
  })

  it('addBlock appends a new empty block and errors on duplicate label', () => {
    const { routine, applied } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'addBlock', label: 'Hamstrings', note: 'PNF' },
    ])
    const block = routine.find((b) => b.label === 'Hamstrings')!
    expect(block.exercises).toEqual([])
    expect(block.note).toBe('PNF')
    expect(applied.some((m) => m.includes('Hamstrings'))).toBe(true)

    const { errors } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'addBlock', label: 'pancake' }, // case-insensitive dup
    ])
    expect(errors.some((m) => m.includes('already exists'))).toBe(true)
  })

  it('removeBlock removes by label and errors when missing', () => {
    const { routine, applied } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'removeBlock', block: 'pancake' },
    ])
    expect(routine.find((b) => b.label === 'pancake')).toBeUndefined()
    expect(applied.some((m) => m.includes('pancake'))).toBe(true)

    const { errors } = applyFlexEdits(FLEX_ROUTINE, [{ op: 'removeBlock', block: 'Nope' }])
    expect(errors.some((m) => m.includes('not found'))).toBe(true)
  })

  it('setBlockNote sets the note and errors when block missing', () => {
    const { routine, applied } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'setBlockNote', block: 'pancake', note: 'go deeper' },
    ])
    expect(routine.find((b) => b.label === 'pancake')!.note).toBe('go deeper')
    expect(applied.length).toBe(1)

    const { errors } = applyFlexEdits(FLEX_ROUTINE, [
      { op: 'setBlockNote', block: 'Nope', note: 'x' },
    ])
    expect(errors.some((m) => m.includes('not found'))).toBe(true)
  })

  it('does not mutate the input FLEX_ROUTINE', () => {
    const snapshot = JSON.stringify(FLEX_ROUTINE)
    applyFlexEdits(FLEX_ROUTINE, [
      { op: 'setExercise', block: 'pancake', key: 'pancake_hang', fields: { reps: 99 } },
      { op: 'addExercise', block: 'pancake', exercise: { name: 'New' } },
      { op: 'removeBlock', block: 'adductor superset' },
      { op: 'addBlock', label: 'Extra' },
    ])
    expect(JSON.stringify(FLEX_ROUTINE)).toBe(snapshot)
  })
})
