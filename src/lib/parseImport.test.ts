import { describe, expect, it } from 'vitest'
import {
  buildWorkoutRows,
  combineSets,
  distributeWeights,
  matchExercise,
  parseImport,
  parseImportDate,
  parseReps,
  parseWeights,
} from './parseImport'

const TODAY = new Date(2026, 6, 1) // 2026-07-01

describe('parseImportDate', () => {
  it('handles explicit years (2- and 4-digit)', () => {
    expect(parseImportDate('12/25/25')).toBe('2025-12-25')
    expect(parseImportDate('1/14/26')).toBe('2026-01-14')
  })
  it('infers year: future months roll back to last year', () => {
    expect(parseImportDate('3/26', TODAY)).toBe('2026-03-26') // March ≤ July → this year
    expect(parseImportDate('6/20', TODAY)).toBe('2026-06-20')
    expect(parseImportDate('12/25', TODAY)).toBe('2025-12-25') // Dec > July → last year
  })
  it('rejects non-dates', () => {
    expect(parseImportDate('main chest')).toBeNull()
    expect(parseImportDate('lateral raises')).toBeNull()
  })
})

describe('parseReps', () => {
  const reps = (s: string) => parseReps(s).tokens.map((t) => t.reps)
  it('expands NxM as M sets of N', () => {
    expect(reps('13x4')).toEqual([13, 13, 13, 13])
    expect(reps('4x4')).toEqual([4, 4, 4, 4])
  })
  it('mixes NxM with trailing singles', () => {
    expect(reps('13x3 14')).toEqual([13, 13, 13, 14])
    expect(reps('10x2 7x2')).toEqual([10, 10, 7, 7])
    expect(reps('10x3 11 7')).toEqual([10, 10, 10, 11, 7])
  })
  it('treats each number as a set', () => {
    expect(reps('5 8 10 10')).toEqual([5, 8, 10, 10])
  })
  it('flags PR (!) and approximate (~)', () => {
    expect(parseReps('1!').tokens[0]).toEqual({ reps: 1, note: 'pr' })
    expect(parseReps('10~ 7 7 7').tokens[0]).toEqual({ reps: 10, note: 'approx' })
  })
})

describe('parseWeights', () => {
  it('reads a single weight', () => {
    expect(parseWeights('72.5').weights).toEqual([72.5])
  })
  it('reads multiple weights split by + or spaces', () => {
    expect(parseWeights('80 + 85').weights).toEqual([80, 85])
    expect(parseWeights('62 71 dumb').weights).toEqual([62, 71])
    expect(parseWeights('105 + 110 + 115 machine').weights).toEqual([105, 110, 115])
  })
  it('captures equipment and tolerates a stray trailing dot', () => {
    expect(parseWeights('120 dumb')).toEqual({ weights: [120], equipment: 'dumbbell' })
    expect(parseWeights('150 barbell')).toEqual({ weights: [150], equipment: 'barbell' })
    expect(parseWeights('121. 132 143').weights).toEqual([121, 132, 143])
  })
})

describe('distributeWeights', () => {
  it('spreads weights across sets, remainder to earlier groups', () => {
    expect(distributeWeights([80, 85], 4)).toEqual([80, 80, 85, 85])
    expect(distributeWeights([105, 110, 115], 4)).toEqual([105, 105, 110, 115])
    expect(distributeWeights([120], 3)).toEqual([120, 120, 120])
  })
})

describe('combineSets', () => {
  it('applies one weight to every set', () => {
    const sets = combineSets('120 dumb', '5 4 4 3')
    expect(sets.map((s) => s.weightLbs)).toEqual([120, 120, 120, 120])
    expect(sets[0].note).toBe('dumbbell')
    expect(sets.warnings).toHaveLength(0)
  })
  it('flags and splits ambiguous weight/set counts', () => {
    const sets = combineSets('80 + 85', '10x3 8')
    expect(sets.map((s) => s.weightLbs)).toEqual([80, 80, 85, 85])
    expect(sets.map((s) => s.reps)).toEqual([10, 10, 10, 8])
    expect(sets.warnings).toHaveLength(1)
  })
  it('leaves weight null for bodyweight rows', () => {
    const sets = combineSets(undefined, '13x4')
    expect(sets.every((s) => s.weightLbs === null)).toBe(true)
  })
  it('carries the PR flag into the set note', () => {
    const sets = combineSets('150 barbell', '1!')
    expect(sets[0].note).toBe('pr; barbell')
  })
})

describe('matchExercise', () => {
  it('fuzzy-matches known exercises', () => {
    expect(matchExercise('leg raises').key).toBe('hanging_leg_raise')
    expect(matchExercise('cable crunches').key).toBe('cable_crunch')
    expect(matchExercise('overhead press').key).toBe('db_overhead_press')
  })
  it('marks unknowns as new', () => {
    expect(matchExercise('prayer curls').isNew).toBe(true)
  })
})

const SAMPLE = `
leg raises

| date | reps |
| --- | --- |
| 4/27 | 13x4 |
| 5/18 | 5 8 10 10 |

cable crunches

| date | weight | reps |
| --- | --- | --- |
| 4/27 | 72.5 | 10x4 |
| 5/25 | 80 + 85 | 10x3 8 |

flat bench

| date | weight | reps |
| --- | --- | --- |
| 6/20 | 150 barbell | 1! |

| exercise | set |
| --- | --- |
| main chest | 3-4 |

super set

| lateral raises | 3-4 | 8-12 |
| --- | --- | --- |

pull down

| date | weight | reps |
| --- | --- | --- |
|  |  |  |

weight (morning after restroom)

| date | weight (lbs) |
| --- | --- |
| 5/10 | 167.8 (sick yesterday) |
| 5/12 | 170.8 |

| 5/29 | 172.4 |
| --- | --- |
| 7/1 | 167.0 |
`

describe('parseImport (integration)', () => {
  const result = parseImport(SAMPLE, TODAY)

  it('extracts only real exercise tables, ignoring config/superset/empty ones', () => {
    expect(result.exercises.map((e) => e.rawName).sort()).toEqual([
      'cable crunches',
      'flat bench',
      'leg raises',
    ])
  })

  it('parses entries and dates per exercise', () => {
    const legs = result.exercises.find((e) => e.rawName === 'leg raises')!
    expect(legs.entries.map((en) => en.date)).toEqual(['2026-04-27', '2026-05-18'])
    expect(legs.entries[1].sets.map((s) => s.reps)).toEqual([5, 8, 10, 10])
  })

  it('surfaces ambiguity warnings and PR notes', () => {
    const cable = result.exercises.find((e) => e.rawName === 'cable crunches')!
    expect(cable.entries.find((e) => e.date === '2026-05-25')!.warnings).toHaveLength(1)
    const flat = result.exercises.find((e) => e.rawName === 'flat bench')!
    expect(flat.entries[0].sets[0].note).toContain('pr')
  })

  it('collects body weights including the orphaned continuation table', () => {
    expect(result.bodyWeights.map((b) => b.date)).toEqual([
      '2026-05-10',
      '2026-05-12',
      '2026-05-29',
      '2026-07-01',
    ])
    expect(result.bodyWeights[0]).toMatchObject({ weightLbs: 167.8, note: 'sick yesterday' })
  })
})

describe('buildWorkoutRows', () => {
  it('groups exercises on the same date into one session', () => {
    const result = parseImport(SAMPLE, TODAY)
    const keys = { 'leg raises': 'hanging_leg_raise', 'cable crunches': 'cable_crunch', 'flat bench': 'flat_dumbbell_press' }
    const rows = buildWorkoutRows(result.exercises, keys)
    // Both leg raises and cable crunches logged on 2026-04-27 → same session id.
    const apr27 = rows.filter((r) => r.date === '2026-04-27')
    expect(new Set(apr27.map((r) => r.session_id)).size).toBe(1)
    expect(rows.every((r) => r.is_historical)).toBe(true)
  })
})
