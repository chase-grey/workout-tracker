import { describe, expect, it } from 'vitest'
import {
  applySessionSamples,
  clampRestRatio,
  EMPTY_EXERCISE_AVERAGES,
  EMPTY_REST_RATIO,
  estimateSecs,
  foldAvg,
  foldRestRatio,
  formatDuration,
  isSaneDuration,
  learnedRestRatio,
  MAX_REST_RATIO,
  median,
  medianTotalSec,
  mergeDurations,
  mergeExerciseAverages,
  MIN_REST_RATIO,
  normalizeExerciseAverages,
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
  it('pools all stretches when no routine is asked for', () => {
    const history = [sd(600), sd(900), sd(1200), wd('push', 3600)]
    expect(medianTotalSec(history, { kind: 'stretch' })).toBe(900)
  })

  // The two routines are not the same length — head to toe runs about twice the
  // side split — so pooling them would report half the truth in either one.
  describe('by stretch routine', () => {
    const h2t = (totalSec: number): SessionDuration => ({ ...sd(totalSec), routine: 'head_to_toe' })
    const split = (totalSec: number): SessionDuration => ({ ...sd(totalSec), routine: 'side_split' })

    it('keeps the two routines apart', () => {
      const history = [h2t(2400), h2t(2280), h2t(2520), split(1200), split(1080), split(1320)]
      expect(medianTotalSec(history, { kind: 'stretch', routine: 'head_to_toe' })).toBe(2400)
      expect(medianTotalSec(history, { kind: 'stretch', routine: 'side_split' })).toBe(1200)
    })

    // Those sessions predate the second routine, so the split keeps every sample
    // it has ever had rather than starting over.
    it('counts an untagged stretch as a side split', () => {
      const history = [sd(600), sd(900), sd(1200)]
      expect(medianTotalSec(history, { kind: 'stretch', routine: 'side_split' })).toBe(900)
      expect(medianTotalSec(history, { kind: 'stretch', routine: 'head_to_toe' })).toBeNull()
    })

    it('is null for a routine with nothing on record yet', () => {
      const history = [split(1200), split(1080), split(1320), h2t(2400)]
      expect(medianTotalSec(history, { kind: 'stretch', routine: 'head_to_toe' })).toBeNull()
    })
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

describe('clampRestRatio', () => {
  it('holds the ratio inside the sane band', () => {
    expect(clampRestRatio(1.15)).toBeCloseTo(1.15)
    expect(clampRestRatio(9)).toBe(MAX_REST_RATIO)
    expect(clampRestRatio(0.01)).toBe(MIN_REST_RATIO)
    // Tapping through every rest is a real observation, not junk.
    expect(clampRestRatio(0)).toBe(MIN_REST_RATIO)
  })
  it('reads an unusable ratio as 1×', () => {
    expect(clampRestRatio(NaN)).toBe(1)
    expect(clampRestRatio(-2)).toBe(1)
    expect(clampRestRatio(Infinity)).toBe(1)
  })
})

describe('foldRestRatio', () => {
  it('folds observed÷prescribed as `count` samples of the session ratio', () => {
    // 690s actually rested against 600s prescribed over 6 rests → 1.15×
    const a = foldRestRatio(EMPTY_REST_RATIO, 690, 600, 6)
    expect(a.ratio).toBeCloseTo(1.15)
    expect(a.n).toBe(6)
    // A second session at 0.85× over 6 more rests → mean 1.0×
    const b = foldRestRatio(a, 510, 600, 6)
    expect(b.ratio).toBeCloseTo(1)
    expect(b.n).toBe(12)
  })

  it('weights sessions by their rest count', () => {
    const a = foldRestRatio(EMPTY_REST_RATIO, 200, 100, 1) // 2× over 1 rest
    const b = foldRestRatio(a, 300, 300, 3) // 1× over 3 rests
    // (2·1 + 1·3) / 4
    expect(b.ratio).toBeCloseTo(1.25)
    expect(b.n).toBe(4)
  })

  it('clamps a freak session before folding it', () => {
    // 40 minutes of "rest" against 60s prescribed is 40×, folded as 4×
    const a = foldRestRatio(EMPTY_REST_RATIO, 2400, 60, 1)
    expect(a.ratio).toBe(MAX_REST_RATIO)
    // Every rest skipped is 0×, folded as the 0.25× floor
    const b = foldRestRatio(EMPTY_REST_RATIO, 0, 600, 6)
    expect(b.ratio).toBe(MIN_REST_RATIO)
  })

  it('ignores samples it cannot form a ratio from', () => {
    const prev = { ratio: 1.2, n: 4 }
    expect(foldRestRatio(prev, 600, 0, 6)).toBe(prev) // nothing prescribed
    expect(foldRestRatio(prev, 600, 500, 0)).toBe(prev) // no intervals
    expect(foldRestRatio(prev, NaN, 500, 6)).toBe(prev)
    expect(foldRestRatio(prev, 600, NaN, 6)).toBe(prev)
  })
})

describe('applySessionSamples', () => {
  it('folds per-exercise active time and the pooled rest ratio', () => {
    const next = applySessionSamples(EMPTY_EXERCISE_AVERAGES, {
      exercises: [
        { exercise: 'bench', totalActiveSec: 120, sets: 3 }, // 40/set
        { exercise: 'squat', totalActiveSec: 200, sets: 4 }, // 50/set
      ],
      restTotalSec: 660,
      restPrescribedSec: 600,
      restCount: 6, // 1.1× prescribed
    })
    expect(next.active.bench).toEqual({ avgSec: 40, n: 3 })
    expect(next.active.squat).toEqual({ avgSec: 50, n: 4 })
    expect(next.restRatio.ratio).toBeCloseTo(1.1)
    expect(next.restRatio.n).toBe(6)
  })

  it('accumulates across sessions', () => {
    const a = applySessionSamples(EMPTY_EXERCISE_AVERAGES, {
      exercises: [{ exercise: 'bench', totalActiveSec: 120, sets: 3 }], // 40/set
      restTotalSec: 0,
      restPrescribedSec: 0,
      restCount: 0,
    })
    const b = applySessionSamples(a, {
      exercises: [{ exercise: 'bench', totalActiveSec: 120, sets: 1 }], // one 120s set
      restTotalSec: 0,
      restPrescribedSec: 0,
      restCount: 0,
    })
    // running mean of 40,40,40,120 = 60 over n=4
    expect(b.active.bench).toEqual({ avgSec: 60, n: 4 })
    expect(b.restRatio).toEqual(EMPTY_REST_RATIO)
  })

  it('skips bad samples without crashing', () => {
    const next = applySessionSamples(EMPTY_EXERCISE_AVERAGES, {
      exercises: [
        { exercise: '', totalActiveSec: 100, sets: 2 },
        { exercise: 'bench', totalActiveSec: 100, sets: 0 },
        { exercise: 'squat', totalActiveSec: NaN, sets: 2 },
      ],
      restTotalSec: 100,
      restPrescribedSec: 100,
      restCount: 0,
    })
    expect(next).toEqual(EMPTY_EXERCISE_AVERAGES)
  })

  it('learns nothing from rest when the prescription is missing', () => {
    // A queued write from a build that predated restPrescribedSec.
    const stale = { exercises: [], restTotalSec: 600, restCount: 6 } as unknown as Parameters<
      typeof applySessionSamples
    >[1]
    expect(applySessionSamples(EMPTY_EXERCISE_AVERAGES, stale).restRatio).toEqual(EMPTY_REST_RATIO)
  })
})

describe('normalizeExerciseAverages', () => {
  it('keeps a current payload, clamping the stored ratio', () => {
    const got = normalizeExerciseAverages({
      active: { bench: { avgSec: 55, n: 9 } },
      restRatio: { ratio: 12, n: 30 },
    })
    expect(got.active.bench).toEqual({ avgSec: 55, n: 9 })
    expect(got.restRatio).toEqual({ ratio: MAX_REST_RATIO, n: 30 })
  })

  it('degrades a legacy pooled-seconds rest average to no samples', () => {
    // v1 shape: `rest` in SECONDS. Read as a ratio it would price every rest at
    // 90× its prescription, so the rest learning has to be dropped.
    const got = normalizeExerciseAverages({
      active: { bench: { avgSec: 55, n: 9 } },
      rest: { avgSec: 90, n: 12 },
    })
    expect(got.restRatio).toEqual(EMPTY_REST_RATIO)
    expect(learnedRestRatio(got)).toBeNull()
    // The per-exercise active averages are unit-compatible, so they survive.
    expect(got.active.bench).toEqual({ avgSec: 55, n: 9 })
  })

  it('drops junk entries and junk payloads', () => {
    expect(normalizeExerciseAverages(null)).toEqual(EMPTY_EXERCISE_AVERAGES)
    expect(normalizeExerciseAverages('nope')).toEqual(EMPTY_EXERCISE_AVERAGES)
    expect(normalizeExerciseAverages({})).toEqual(EMPTY_EXERCISE_AVERAGES)
    const got = normalizeExerciseAverages({
      active: { bench: { avgSec: NaN, n: 3 }, squat: { avgSec: 50, n: 0 }, fly: null, '': { avgSec: 1, n: 1 } },
      restRatio: { ratio: 0, n: 5 },
    })
    expect(got).toEqual(EMPTY_EXERCISE_AVERAGES)
  })

  it('round-trips what applySessionSamples produced', () => {
    const folded = applySessionSamples(EMPTY_EXERCISE_AVERAGES, {
      exercises: [{ exercise: 'bench', totalActiveSec: 120, sets: 3 }],
      restTotalSec: 660,
      restPrescribedSec: 600,
      restCount: 6,
    })
    expect(normalizeExerciseAverages(JSON.parse(JSON.stringify(folded)))).toEqual(folded)
  })
})

describe('mergeExerciseAverages', () => {
  const local: ExerciseAverages = {
    active: { bench: { avgSec: 40, n: 9 }, squat: { avgSec: 55, n: 4 } },
    restRatio: { ratio: 1.2, n: 30 },
  }

  it('keeps everything local when the backend has folded nothing', () => {
    expect(mergeExerciseAverages(local, EMPTY_EXERCISE_AVERAGES)).toEqual(local)
  })

  it('lets the backend win per exercise but keeps ones it does not know', () => {
    const got = mergeExerciseAverages(local, {
      active: { bench: { avgSec: 44, n: 20 } },
      restRatio: { ratio: 0.9, n: 50 },
    })
    expect(got.active.bench).toEqual({ avgSec: 44, n: 20 }) // backend pooled more
    expect(got.active.squat).toEqual({ avgSec: 55, n: 4 }) // local-only, survives
    expect(got.restRatio).toEqual({ ratio: 0.9, n: 50 })
  })

  it('keeps the local rest ratio when the backend has no samples for it', () => {
    const got = mergeExerciseAverages(local, {
      active: { bench: { avgSec: 44, n: 20 } },
      restRatio: EMPTY_REST_RATIO,
    })
    expect(got.restRatio).toEqual({ ratio: 1.2, n: 30 })
  })
})

describe('mergeDurations', () => {
  const a: SessionDuration = { date: '2026-08-02', kind: 'workout', dayType: 'push', totalSec: 3600, restSec: 900 }
  const b: SessionDuration = { date: '2026-08-05', kind: 'stretch', totalSec: 900, restSec: 60 }

  it('keeps local history when the backend returns nothing', () => {
    expect(mergeDurations([a, b], [])).toEqual([a, b])
  })

  it('unions both sides and sorts by date', () => {
    expect(mergeDurations([b], [a])).toEqual([a, b])
  })

  it('does not duplicate a session both sides already have', () => {
    expect(mergeDurations([a, b], [a])).toEqual([a, b])
  })

  it('keeps two same-day sessions of different kinds apart', () => {
    const stretchSameDay: SessionDuration = { ...b, date: '2026-08-02' }
    expect(mergeDurations([a], [stretchSameDay])).toHaveLength(2)
  })

  it('keeps two workouts of the same day type but different lengths apart', () => {
    expect(mergeDurations([a], [{ ...a, totalSec: 2400 }])).toHaveLength(2)
  })

  // Two stretches of the same day and the same length, one of each routine: the
  // day both were run is the case the core-skip rule exists for.
  it('keeps two same-day stretches of different routines apart', () => {
    const one: SessionDuration = { ...b, routine: 'side_split' }
    const two: SessionDuration = { ...b, routine: 'head_to_toe' }
    expect(mergeDurations([one], [two])).toHaveLength(2)
  })
})

describe('remainingWorkoutSecs', () => {
  const steps = [
    { exercise: 'bench', fallbackActiveSec: 40, prescribedRestSec: 120 },
    { exercise: 'bench', fallbackActiveSec: 40, prescribedRestSec: 120 },
    { exercise: 'fly', fallbackActiveSec: 40, prescribedRestSec: 60 },
  ]

  it('uses structural fallbacks on day one (no averages)', () => {
    // (40+120) + (40+120) + (40+60) = 420
    expect(remainingWorkoutSecs(EMPTY_EXERCISE_AVERAGES, steps)).toBe(420)
  })

  it('falls back to prescribed rest when only active time has been learned', () => {
    const averages: ExerciseAverages = {
      active: { bench: { avgSec: 55, n: 9 } }, // fly has no history → fallback 40
      restRatio: EMPTY_REST_RATIO,
    }
    // (55+120) + (55+120) + (40+60) = 450
    expect(remainingWorkoutSecs(averages, steps)).toBe(450)
  })

  it('scales each step by its OWN prescribed rest', () => {
    const averages: ExerciseAverages = {
      active: { bench: { avgSec: 55, n: 9 } },
      restRatio: { ratio: 1.2, n: 30 },
    }
    // (55 + 144) + (55 + 144) + (40 + 72) = 510
    expect(remainingWorkoutSecs(averages, steps)).toBeCloseTo(510)
  })

  it('keeps long and short prescribed rests apart in one remaining list', () => {
    // The bug this replaced: one pooled rest average, learned mostly from 30s
    // circuit station changes, priced the 150s inter-set rests at 30s too.
    const mixed = [
      { exercise: 'row', fallbackActiveSec: 40, prescribedRestSec: 150 }, // heavy set
      { exercise: 'row', fallbackActiveSec: 40, prescribedRestSec: 30 }, // station change
      { exercise: 'curl', fallbackActiveSec: 40, prescribedRestSec: 30 },
      { exercise: 'curl', fallbackActiveSec: 40, prescribedRestSec: 90 }, // capped transition
      { exercise: 'plank', fallbackActiveSec: 40, prescribedRestSec: 0 }, // final set
    ]
    const ratio = 1.1
    const averages: ExerciseAverages = { active: {}, restRatio: { ratio, n: 40 } }
    const prescribed = 150 + 30 + 30 + 90 + 0
    expect(remainingWorkoutSecs(averages, mixed)).toBeCloseTo(5 * 40 + prescribed * ratio)
    // The pooled-seconds estimator would have charged every rest the mean of
    // those five (60s), losing 90s on the heavy rest alone.
    expect(remainingWorkoutSecs(averages, mixed)).toBeGreaterThan(5 * 40 + 5 * 60)
  })

  it('never charges negative time', () => {
    const averages: ExerciseAverages = { active: { bench: { avgSec: -10, n: 4 } }, restRatio: { ratio: 2, n: 8 } }
    expect(
      remainingWorkoutSecs(averages, [{ exercise: 'bench', fallbackActiveSec: 40, prescribedRestSec: -60 }]),
    ).toBe(0)
  })

  it('ignores a ratio with no samples behind it', () => {
    const averages: ExerciseAverages = { active: {}, restRatio: { ratio: 3, n: 0 } }
    expect(remainingWorkoutSecs(averages, steps)).toBe(420)
  })
})
