/**
 * Pure, structured-edit engine for the side-splits stretch routine. Lets the AI
 * chat (or any caller) transform a FLEX_ROUTINE via a list of declarative edits
 * without mutating the input. All ops are validated; invalid edits/fields are
 * skipped and reported rather than throwing.
 */
import type { FlexBlock, FlexExercise } from '../config/flexPlan'
import { unslugKey } from '../config/plan'

export type FlexEdit =
  | {
      op: 'setExercise'
      block: string
      key: string
      fields: Partial<Pick<FlexExercise, 'name' | 'sets' | 'maxSets' | 'reps' | 'tempo' | 'restSec'>>
    }
  | { op: 'addExercise'; block: string; exercise: Partial<Omit<FlexExercise, 'key'>> & { key?: string } }
  | { op: 'removeExercise'; block: string; key: string }
  | { op: 'addBlock'; label: string; note?: string }
  | { op: 'removeBlock'; block: string }
  | { op: 'setBlockNote'; block: string; note: string }

export const FLEX_EDIT_OPS = [
  'setExercise',
  'addExercise',
  'removeExercise',
  'addBlock',
  'removeBlock',
  'setBlockNote',
] as const

const STRING_FIELDS = ['name', 'sets', 'tempo'] as const
const NUMERIC_FIELDS = ['maxSets', 'reps', 'restSec'] as const

type StringField = (typeof STRING_FIELDS)[number]
type NumericField = (typeof NUMERIC_FIELDS)[number]

function deepClone(routine: FlexBlock[]): FlexBlock[] {
  return JSON.parse(JSON.stringify(routine)) as FlexBlock[]
}

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase()
}

function findBlock(routine: FlexBlock[], label: string): FlexBlock | undefined {
  const target = normalizeLabel(label)
  return routine.find((b) => normalizeLabel(b.label) === target)
}

function isNumericField(field: string): field is NumericField {
  return (NUMERIC_FIELDS as readonly string[]).includes(field)
}

function isStringField(field: string): field is StringField {
  return (STRING_FIELDS as readonly string[]).includes(field)
}

function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function uniqueKey(block: FlexBlock, base: string): string {
  const existing = new Set(block.exercises.map((e) => e.key))
  if (!existing.has(base)) return base
  let n = 2
  while (existing.has(`${base}_${n}`)) n++
  return `${base}_${n}`
}

export function applyFlexEdits(
  routine: FlexBlock[],
  edits: FlexEdit[],
): { routine: FlexBlock[]; applied: string[]; errors: string[] } {
  const next = deepClone(routine)
  const applied: string[] = []
  const errors: string[] = []

  for (const edit of edits) {
    switch (edit.op) {
      case 'setExercise': {
        const block = findBlock(next, edit.block)
        if (!block) {
          errors.push(`setExercise: block "${edit.block}" not found`)
          break
        }
        const exercise = block.exercises.find((e) => e.key === edit.key)
        if (!exercise) {
          errors.push(`setExercise: exercise "${edit.key}" not found in block "${block.label}"`)
          break
        }
        const changed: string[] = []
        const ignored: string[] = []
        for (const [field, value] of Object.entries(edit.fields ?? {})) {
          if (isNumericField(field)) {
            if (isValidNumber(value)) {
              exercise[field] = value
              changed.push(field)
            } else {
              ignored.push(field)
            }
          } else if (isStringField(field)) {
            // Blank is a real value for sets/tempo, but a blank name leaves the row
            // with nothing to show but its key.
            if (typeof value === 'string' && (field !== 'name' || value.trim())) {
              exercise[field] = value
              changed.push(field)
            } else {
              ignored.push(field)
            }
          } else {
            ignored.push(field)
          }
        }
        if (changed.length > 0) {
          applied.push(
            `setExercise: updated ${changed.join(', ')} on "${edit.key}" in "${block.label}"`,
          )
        }
        if (ignored.length > 0) {
          errors.push(
            `setExercise: ignored invalid field(s) ${ignored.join(', ')} on "${edit.key}" in "${block.label}"`,
          )
        }
        break
      }

      case 'addExercise': {
        const block = findBlock(next, edit.block)
        if (!block) {
          errors.push(`addExercise: block "${edit.block}" not found`)
          break
        }
        const src = edit.exercise
        const baseKeyRaw = src.key && src.key.trim() ? slug(src.key) : slug(src.name ?? '')
        const baseKey = baseKeyRaw || 'exercise'
        const key = uniqueKey(block, baseKey)
        const exercise: FlexExercise = {
          key,
          // Named off the key, not with it: a key added bare would otherwise show
          // up in the routine with its underscores intact.
          name: typeof src.name === 'string' && src.name.trim() ? src.name : unslugKey(key),
          sets: typeof src.sets === 'string' ? src.sets : '3',
          maxSets: isValidNumber(src.maxSets) ? src.maxSets : 3,
          reps: isValidNumber(src.reps) ? src.reps : 8,
          tempo: typeof src.tempo === 'string' ? src.tempo : '',
          restSec: isValidNumber(src.restSec) ? src.restSec : 90,
        }
        block.exercises.push(exercise)
        applied.push(`addExercise: added "${exercise.name}" to "${block.label}"`)
        break
      }

      case 'removeExercise': {
        const block = findBlock(next, edit.block)
        if (!block) {
          errors.push(`removeExercise: block "${edit.block}" not found`)
          break
        }
        const idx = block.exercises.findIndex((e) => e.key === edit.key)
        if (idx === -1) {
          errors.push(`removeExercise: exercise "${edit.key}" not found in block "${block.label}"`)
          break
        }
        const [removed] = block.exercises.splice(idx, 1)
        applied.push(
          `removeExercise: removed "${removed.name || unslugKey(removed.key)}" from "${block.label}"`,
        )
        break
      }

      case 'addBlock': {
        if (findBlock(next, edit.label)) {
          errors.push(`addBlock: block "${edit.label}" already exists`)
          break
        }
        const block: FlexBlock = { label: edit.label, exercises: [] }
        if (typeof edit.note === 'string') block.note = edit.note
        next.push(block)
        applied.push(`addBlock: added "${edit.label}"`)
        break
      }

      case 'removeBlock': {
        const target = normalizeLabel(edit.block)
        const idx = next.findIndex((b) => normalizeLabel(b.label) === target)
        if (idx === -1) {
          errors.push(`removeBlock: block "${edit.block}" not found`)
          break
        }
        const [removed] = next.splice(idx, 1)
        applied.push(`removeBlock: removed "${removed.label}"`)
        break
      }

      case 'setBlockNote': {
        const block = findBlock(next, edit.block)
        if (!block) {
          errors.push(`setBlockNote: block "${edit.block}" not found`)
          break
        }
        block.note = edit.note
        applied.push(`setBlockNote: set note on "${block.label}"`)
        break
      }

      default: {
        // Exhaustiveness guard: unknown op shape.
        const unknown = edit as { op?: unknown }
        errors.push(`unknown op "${String(unknown.op)}"`)
        break
      }
    }
  }

  return { routine: next, applied, errors }
}
