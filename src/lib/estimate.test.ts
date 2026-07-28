import { describe, expect, it } from 'vitest'
import {
  applySessionSamples,
  EMPTY_EXERCISE_AVERAGES,
  estimateSecs,
  foldAvg,
  formatDuration,
  isSaneDuration,
  median,
  medianTotalSec,
  remainingSecs,
  remainingWorkoutSecs,
  type ExerciseAverages,
  type SessionDuration,
} from './estimate'

describe('estimateSecs', () => {
  it('sums remainingSets × (work + rest)', () => {
    expect(
      estimateSecs([
        { remainingSets: 2, workSec: 40, restSec: 60 }, // 200
        { remainingSets: 3, workSec: 10, restSec: 90 }, // 300
      ]),
    ).toBe(500)
  })
  it('ignores negative remaining sets', () => {
    expect(estimateSecs([{ remainingSets: -1, workSec: 40, restSec: 60 }])).toBe(0)
  })
})

describe('formatDuration', () => {
  it('formats minutes', () => {
    expect(formatDuration(500)).toBe('~8 min')
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(20)).toBe('<1 min')
  })
})

describe('median', () => {
  it('handles odd and even lengths and an empty list', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([])).toBe(0)
  })
})

describe('isSaneDuration', () => {
  it('rejects durations that are too short or too long', () => {
    expect(isSaneDuration(30)).toBe(false) // under 2 min
    expect(isSaneDuration(30 * 60)).toBe(true)
    expect(isSaneDuration(5 * 60 * 60)).toBe(false) // over 4 hr
  })
})

const wd = (dayType: 'push' | 'pull', totalSec: number, restSec = 0): SessionDuration => ({
  date: '2026-07-21',
  kind: 'workout',
  dayType,
  totalSec,
  restSec,
})
const sd = (totalSec: number, restSec = 0): SessionDuration => ({
  date: '2026-07-21',
  kind: 'stretch',
  totalSec,
  restSec,
})

describe('medianTotalSec', () => {
  it('returns null until there are enough matching samples', () => {
    expect(medianTotalSec([wd('push', 3000), wd('push', 3600)], { kind: 'workout', dayType: 'push' })).toBeNull()
  })
  it('returns the median once enough samples exist', () => {
    const history = [wd('push', 3000), wd('push', 3600), wd('push', 4200)]
    expect(medianTotalSec(history, { kind: 'workout', dayType: 'push' })).toBe(3600)
  })
  it('separates workout day types and ignores other kinds and insane values', () => {
    const history = [
      wd('push', 3000),
      wd('push', 3600),
      wd('push', 4200),
      wd('push', 10), // too short — ignored
      wd('pull', 1800), // wrong day type — ignored for push
      sd(1200), // stretch — ignored for workout
    ]
    expect(medianTotalSec(history, { kind: 'workout', dayType: 'push' })).toBe(3600)
  })
  it('pools all stretches (no day type)', () => {
    const history = [sd(600), sd(900), sd(1200), wd('push', 3600)]
    expect(medianTotalSec(history, { kind: 'stretch' })).toBe(900)
  })
})

describe('remainingSecs', () => {
  const fallbackItems = [{ remainingSets: 5, workSec: 40, restSec: 60 }] // 500

  it('falls back to the structural estimate without enough history', () => {
    expect(
      remainingSecs({
        history: [wd('push', 3600)],
        sel: { kind: 'workout', dayType: 'push' },
        doneSteps: 0,
        totalSteps: 10,
        fallbackItems,
      }),
    ).toBe(500)
  })

  it('scales the learned median by the fraction of steps remaining', () => {
    const history = [wd('push', 3000), wd('push', 3600), wd('push', 4200)] // median 3600
    // 4 of 10 done → 60% remaining → 2160s
    expect(
      remainingSecs({
        history,
        sel: { kind: 'workout', dayType: 'push' },
        doneSteps: 4,
        totalSteps: 10,
        fallbackItems,
      }),
    ).toBe(2160)
  })

  it('returns 0 when everything is done', () => {
    const history = [sd(600), sd(900), sd(1200)] // median 900
    expect(
      remainingSecs({
        history,
        sel: { kind: 'stretch' },
        doneSteps: 8,
        totalSteps: 8,
        fallbackItems,
      }),
    ).toBe(0)
  })
})

describe('foldAvg', () => {
  it('is the running mean when folding single samples one at a time', () => {
    let a = foldAvg({ avgSec: 0, n: 0 }, 30, 1)
    expect(a).toEqual({ avgSec: 30, n: 1 })
    a = foldAvg(a, 60, 1) // mean of 30,60
    expect(a).toEqual({ avgSec: 45, n: 2 })
    a = foldAvg(a, 90, 1) // mean of 30,60,90
    expect(a).toEqual({ avgSec: 60, n: 3 })
  })

  it('folding a summed batch equals folding each sample separately', () => {
    const batched = foldAvg({ avgSec: 0, n: 0 }, 30 + 60 + 90, 3)
    expect(batched).toEqual({ avgSec: 60, n: 3 })
  })

  it('ignores a non-positive count', () => {
    const prev = { avgSec: 40, n: 2 }
    expect(foldAvg(prev, 100, 0)).toBe(prev)
  })
})

describe('applySessionSamples', () => {
  it('folds per-exercise active time and pooled rest', () => {
    const next = applySessionSamples(EMPTY_EXERCISE_AVERAGES, {
      exercises: [
        { exercise: 'bench', totalActiveSec: 120, sets: 3 }, // 40/set
        { exercise: 'squat', totalActiveSec: 200, sets: 4 }, // 50/set
      ],
      restTotalSec: 600,
      restCount: 6, // 100/rest
    })
    expect(next.active.bench).toEqual({ avgSec: 40, n: 3 })
    expect(next.active.squat).toEqual({ avgSec: 50, n: 4 })
    expect(next.rest).toEqual({ avgSec: 100, n: 6 })
  })

  it('accumulates across sessions', () => {
    const a = applySessionSamples(EMPTY_EXERCISE_AVERAGES, {
      exercises: [{ exercise: 'bench', totalActiveSec: 120, sets: 3 }], // 40/set
      restTotalSec: 0,
      restCount: 0,
    })
    const b = applySessionSamples(a, {
      exercises: [{ exercise: 'bench', totalActiveSec: 120, sets: 1 }], // one 120s set
      restTotalSec: 0,
      restCount: 0,
    })
    // running mean of 40,40,40,120 = 60 over n=4
    expect(b.active.bench).toEqual({ avgSec: 60, n: 4 })
  })

  it('skips bad samples without crashing', () => {
    const next = applySessionSamples(EMPTY_EXERCISE_AVERAGES, {
      exercises: [
        { exercise: '', totalActiveSec: 100, sets: 2 },
        { exercise: 'bench', totalActiveSec: 100, sets: 0 },
        { exercise: 'squat', totalActiveSec: NaN, sets: 2 },
      ],
      restTotalSec: 100,
      restCount: 0,
    })
    expect(next).toEqual(EMPTY_EXERCISE_AVERAGES)
  })
})

describe('remainingWorkoutSecs', () => {
  const steps = [
    { exercise: 'bench', fallbackActiveSec: 40, fallbackRestSec: 120 },
    { exercise: 'bench', fallbackActiveSec: 40, fallbackRestSec: 120 },
    { exercise: 'fly', fallbackActiveSec: 40, fallbackRestSec: 60 },
  ]

  it('uses structural fallbacks on day one (no averages)', () => {
    // (40+120) + (40+120) + (40+60) = 420
    expect(remainingWorkoutSecs(EMPTY_EXERCISE_AVERAGES, steps)).toBe(420)
  })

  it('prefers learned active + pooled rest where available', () => {
    const averages: ExerciseAverages = {
      active: { bench: { avgSec: 55, n: 9 } }, // fly has no history → fallback 40
      rest: { avgSec: 90, n: 12 }, // pooled rest overrides prescribed rest
    }
    // (55+90) + (55+90) + (40+90) = 420
    expect(remainingWorkoutSecs(averages, steps)).toBe(420)
  })
})
