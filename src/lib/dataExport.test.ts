import { describe, expect, it } from 'vitest'
import { DAY_TYPES, PLAN } from '../config/plan'
import { FLEX_ROUTINES, FLEX_ROUTINE_KEYS, type FlexRoutineKey } from '../config/flexRoutines'
import type { FlexBlock } from '../config/flexPlan'
import type { Settings } from '../services/storage'
import type { BodyWeightEntry, WorkoutRow } from '../types'
import type { CalorieEntry } from './calories'
import type { CardioEntry } from './cardio'
import { toISODate } from './dates'
import { EMPTY_EXERCISE_AVERAGES, type SessionDuration } from './estimate'
import type { FlexEntry } from './flex'
import type { Profile } from './profile'
import {
  AI_EXPORT_MAX_CHARS,
  ANALYSIS_PROMPT,
  EXPORT_FORMAT,
  buildAiText,
  buildAnalysisPaste,
  buildExport,
  exportFileName,
  exportJson,
  exportableSettings,
  type ExportInput,
} from './dataExport'

const TODAY = '2026-11-19'

const flexPlans = Object.fromEntries(FLEX_ROUTINE_KEYS.map((k) => [k, FLEX_ROUTINES[k].blocks])) as Record<
  FlexRoutineKey,
  FlexBlock[]
>

const profile: Profile = {
  name: 'Maya Okafor',
  pillars: ['strength', 'flexibility', 'cardio', 'diet'],
  sex: 'female',
  birthYear: 1992,
  dietDirection: 'lose',
  targetWeightLbs: 140,
  strength: { daysPerWeek: 3, equipment: 'gym' },
  weeklyGoals: [{ from: '2025-01-06', goals: { workouts: 3, flex: 2, calDays: 5, cardio: 2 } }],
  calorieGoals: [{ from: '2025-01-06', goal: 1900 }],
  createdAt: '2025-01-06T00:00:00Z',
}

const settings: Settings = {
  apiUrl: 'https://script.example/exec-SECRET-URL',
  openAiKey: 'sk-ant-SECRET-KEY',
  chatToken: 'SECRET-CHAT-TOKEN',
  accountToken: 'SECRET-ACCOUNT-TOKEN',
  aiBaseUrl: 'https://llm.example/SECRET-BASE',
  accountName: 'maya@example.com',
  accountMode: 'hosted',
  heightIn: 66,
  profile,
}

function row(
  date: string,
  session: string,
  exercise: string,
  set: number,
  weight: number | null,
  reps: number,
  extra: Partial<WorkoutRow> = {},
): WorkoutRow {
  return {
    session_id: session,
    date,
    day_type: 'push',
    exercise,
    set_number: set,
    weight_lbs: weight,
    reps,
    notes: '',
    is_historical: false,
    ...extra,
  }
}

function input(over: Partial<ExportInput> = {}): ExportInput {
  return {
    exportedAt: `${TODAY}T15:00:00.000Z`,
    today: TODAY,
    build: 'abc1234',
    workouts: [],
    bodyWeights: [],
    flexEntries: [],
    calorieEntries: [],
    measurements: [],
    durations: [],
    cardioEntries: [],
    exerciseAverages: EMPTY_EXERCISE_AVERAGES,
    plan: PLAN,
    flexPlans,
    settings,
    weeklyGoals: { workouts: 3, flex: 2, calDays: 5, cardio: 2 },
    calorieGoal: 1900,
    dietDirection: 'lose',
    ...over,
  }
}

/** Someone who has used every part of the app for `days`: three lifts, two stretches and two runs a week, the scale and the food log daily. */
function history(days: number): Partial<ExportInput> {
  const workouts: WorkoutRow[] = []
  const bodyWeights: BodyWeightEntry[] = []
  const flexEntries: FlexEntry[] = []
  const calorieEntries: CalorieEntry[] = []
  const cardioEntries: CardioEntry[] = []
  const durations: SessionDuration[] = []
  const end = new Date(2026, 10, 19)
  let lift = 0
  for (let i = days; i >= 0; i--) {
    const d = new Date(end)
    d.setDate(d.getDate() - i)
    const date = toISODate(d)
    const dow = d.getDay()
    bodyWeights.push({ date, weightLbs: 160 - (days - i) * 0.02 })
    calorieEntries.push({ date, calories: 1850 + (i % 7) * 30, protein: 120 + (i % 5), carbs: 200, fat: 60 })
    if (dow === 1 || dow === 3 || dow === 5) {
      const dayType = DAY_TYPES[lift % DAY_TYPES.length]
      const session = `s${lift++}`
      for (const e of PLAN[dayType].exercises) {
        for (let s = 1; s <= e.sets; s++) {
          workouts.push(row(date, session, e.key, s, e.bodyweight ? null : 40 + (lift % 30) * 2.5, e.repMax - (s - 1), { day_type: dayType }))
        }
      }
      durations.push({ date, kind: 'workout', dayType, totalSec: 3300, restSec: 1500 })
    }
    if (dow === 2 || dow === 6) {
      flexEntries.push({
        date,
        splitDeg: null,
        coldSplitDeg: 120 + (days - i) * 0.02,
        warmSplitDeg: 130 + (days - i) * 0.02,
        tailorsLeftDeg: null,
        tailorsRightDeg: null,
        tailorsWarmLeftDeg: 28,
        tailorsWarmRightDeg: 31,
        routines: ['side_split'],
      })
      durations.push({ date, kind: 'stretch', routine: 'side_split', totalSec: 1500, restSec: 300 })
      cardioEntries.push({ id: `c${i}`, date, kind: 'run', minutes: 25, distanceMi: 2.4 })
    }
  }
  return { workouts, bodyWeights, flexEntries, calorieEntries, cardioEntries, durations }
}

describe('buildExport', () => {
  const data = input({
    workouts: [
      row('2026-11-17', 'a', 'flat_bench', 1, 135, 8),
      row('2026-11-17', 'a', 'copenhagen_plank_l', 1, null, 30),
      row('2026-11-17', 'a', 'sled drag', 1, 90, 20),
    ],
    bodyWeights: [
      { date: '2026-11-18', weightLbs: 151 },
      { date: '2026-11-10', weightLbs: 152 },
    ],
    measurements: [{ date: '2026-11-01', waistIn: 30, bodyFatPct: 24 }],
    cardioEntries: [{ id: 'c1', date: '2026-11-16', kind: 'run', minutes: 20, distanceMi: 1.8 }],
    calorieEntries: [{ date: '2026-11-18', calories: 1880, protein: 121 }],
    flexEntries: [{ date: '2026-11-15', splitDeg: null, tailorsLeftDeg: null, tailorsRightDeg: null, warmSplitDeg: 140, routines: ['side_split'] }],
    durations: [{ date: '2026-11-17', kind: 'workout', dayType: 'push', totalSec: 3000, restSec: 1200 }],
  })

  it('carries every kind of record the app keeps', () => {
    const out = buildExport(data)
    expect(out.format).toBe(EXPORT_FORMAT)
    expect(out.workouts).toEqual(data.workouts)
    expect(out.sessionDurations).toEqual(data.durations)
    expect(out.measurements).toEqual(data.measurements)
    expect(out.flexibility).toEqual(data.flexEntries)
    expect(out.calories).toEqual(data.calorieEntries)
    expect(out.cardio).toEqual(data.cardioEntries)
    expect(out.plan).toBe(data.plan)
    expect(out.flexPlans).toBe(data.flexPlans)
    expect(out.goals).toEqual({ weekly: data.weeklyGoals, calorieGoal: 1900, dietDirection: 'lose' })
    expect(out.settings.profile).toEqual(profile)
    expect(out.bodyWeights.map((b) => b.date)).toEqual(['2026-11-10', '2026-11-18'])
  })

  it('says which exercises count seconds, and names one the plan never had', () => {
    const { exercises } = buildExport(data)
    expect(exercises.copenhagen_plank_l.timed).toBe(true)
    expect(exercises.flat_bench.timed).toBeUndefined()
    expect(exercises['sled drag']).toEqual({ name: 'sled drag' })
  })

  it('writes no address, key or token, in either form', () => {
    const texts = [exportJson(data), buildAnalysisPaste(data)]
    for (const text of texts) {
      expect(text).not.toContain('SECRET')
      expect(text).not.toContain('maya@example.com')
    }
    expect(exportableSettings(settings)).not.toHaveProperty('accountToken')
    expect(exportableSettings(settings)).not.toHaveProperty('accountMode')
  })

  it('reads back as the same object', () => {
    expect(JSON.parse(exportJson(data))).toEqual(JSON.parse(JSON.stringify(buildExport(data))))
  })

  it('names the file by the day', () => {
    expect(exportFileName(TODAY)).toBe('workout-data-2026-11-19.json')
  })
})

describe('buildAiText', () => {
  it('writes a session as one line, a weight said once per run of sets', () => {
    const { text, fullFrom } = buildAiText(
      input({
        workouts: [
          row('2026-11-17', 'a', 'flat_bench', 1, 135, 8, { variant: 'A' }),
          row('2026-11-17', 'a', 'flat_bench', 2, 135, 7, { variant: 'A' }),
          row('2026-11-17', 'a', 'flat_bench', 3, 145, 4, { variant: 'A', notes: 'left shoulder' }),
          row('2026-11-17', 'a', 'copenhagen_plank_l', 1, null, 30, { variant: 'A' }),
        ],
        durations: [{ date: '2026-11-17', kind: 'workout', dayType: 'push', totalSec: 3000, restSec: 1200 }],
      }),
    )
    expect(fullFrom).toBeNull()
    expect(text).toContain(
      '2026-11-17 push A 50m (rest 20m) | flat_bench 135x8,7 145x4 [left shoulder] | copenhagen_plank_l BWx30s',
    )
    expect(text).not.toContain('BY MONTH')
  })

  it('lists the other tables with their units in the heading', () => {
    const { text } = buildAiText(
      input({
        bodyWeights: [{ date: '2026-11-18', weightLbs: 151.26 }],
        measurements: [{ date: '2026-11-01', waistIn: 30, neckIn: 13.5, bodyFatPct: 24 }],
        cardioEntries: [{ id: 'c1', date: '2026-11-16', kind: 'run', minutes: 20, distanceMi: 1.8 }],
        calorieEntries: [{ date: '2026-11-18', calories: 1880, protein: 121, carbs: 190, fat: 55 }],
        flexEntries: [
          { date: '2026-11-15', splitDeg: null, tailorsLeftDeg: null, tailorsRightDeg: null, coldSplitDeg: 131, warmSplitDeg: 140, routines: ['side_split'] },
        ],
        durations: [{ date: '2026-11-15', kind: 'stretch', routine: 'side_split', totalSec: 1500, restSec: 300 }],
      }),
    )
    expect(text).toContain('Units: weight lb')
    expect(text).toContain('## BODY WEIGHT (date lb)\n2026-11-18 151.3')
    expect(text).toContain('2026-11-01 waist 30 neck 13.5 bodyfat 24%')
    expect(text).toContain('2026-11-16 run 20min 1.8mi')
    expect(text).toContain('2026-11-18 1880 p121 c190 f55')
    expect(text).toContain('2026-11-15 | session side_split 25m (rest 5m) | coldSplit 131, warmSplit 140')
  })

  it('says who and what for without a name', () => {
    const { text } = buildAiText(input())
    expect(text).toContain('Weekly goals: 3 workouts, 2 stretch sessions, 2 cardio days, 5 days on the calorie target.')
    expect(text).toContain('Calorie target: at most 1900 kcal a day.')
    expect(text).toContain('Target body weight: 140 lb.')
    expect(text).toContain('## CURRENT LIFTING PLAN')
    expect(text).not.toContain('Maya')
  })

  it('leaves out a goal that is switched off', () => {
    const { text } = buildAiText(input({ weeklyGoals: { workouts: 3, flex: 0, calDays: 0, cardio: 0 } }))
    expect(text).toContain('Weekly goals: 3 workouts.')
    expect(text).not.toContain('Calorie target')
  })

  it('keeps a year of everything whole or folds it, and two years inside the budget either way', () => {
    for (const days of [120, 365, 730]) {
      const data = input(history(days))
      const { text, fullFrom } = buildAiText(data)
      expect(text.length).toBeLessThanOrEqual(AI_EXPORT_MAX_CHARS)
      // The last four weeks are always there set by set.
      expect(fullFrom == null || fullFrom <= '2026-10-22').toBe(true)
      expect(text).toContain('2026-11-18 ')
      expect(buildAnalysisPaste(data).length).toBeLessThanOrEqual(AI_EXPORT_MAX_CHARS)
    }
  })

  it('folds what is older than the window into a line a month, and says where the line is', () => {
    const data = input(history(730))
    const { text, fullFrom } = buildAiText(data)
    expect(fullFrom).not.toBeNull()
    expect(text).toContain(`Entries from ${fullFrom} on are listed in full.`)
    expect(text).toMatch(/## LIFTS BY MONTH[^\n]*\n2024-11 \d+ sessions \| /)
    expect(text).toMatch(/## BODY WEIGHT BY MONTH[^\n]*\n2024-11 avg 1\d\d(\.\d)? \(\d+\)/)
    expect(text).toMatch(/2025-03 avg \d+ p\d+ \(31 days\)/)
    expect(text).toMatch(/2025-03 \d+ sessions, \d+min, [\d.]+mi/)
    // Nothing is in both halves: no daily line from before the cutoff.
    const daily = text.split('\n').filter((l) => /^\d{4}-\d\d-\d\d /.test(l))
    expect(daily.every((l) => l.slice(0, 10) >= fullFrom!)).toBe(true)
    // The file is never folded.
    expect(buildExport(data).workouts).toHaveLength(data.workouts.length)
  })

  it('folds the oldest months of a four-year history into years to stay inside', () => {
    const { text, fullFrom } = buildAiText(input(history(1460)))
    expect(text.length).toBeLessThanOrEqual(AI_EXPORT_MAX_CHARS)
    expect(fullFrom).toBe('2026-10-22')
    expect(text).toMatch(/are folded the same way into a line per year/)
    expect(text).toMatch(/\n2023 \d+ sessions \| /)
    expect(text).toMatch(/\n2026-09 \d+ sessions \| /)
  })

  it('takes the longest window that fits', () => {
    const data = input(history(730))
    const loose = buildAiText(data, 1_000_000)
    expect(loose.fullFrom).toBeNull()
    const tight = buildAiText(data, 12_000)
    const normal = buildAiText(data)
    expect(tight.fullFrom! >= normal.fullFrom!).toBe(true)
  })
})

describe('buildAnalysisPaste', () => {
  it('puts the question in front of the log', () => {
    const text = buildAnalysisPaste(input(history(30)))
    expect(text.startsWith(ANALYSIS_PROMPT)).toBe(true)
    expect(text).toContain('TRAINING LOG, exported 2026-11-19')
  })
})
