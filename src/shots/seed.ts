import { DEFAULT_PLAN, DAY_TYPES } from '../config/plan'
import type { BodyWeightEntry, DayType, WorkoutRow } from '../types'
import type { MeasurementEntry } from '../lib/bodyComp'
import type { CalorieEntry } from '../lib/calories'
import type { CardioEntry } from '../lib/cardio'
import type { SessionDuration } from '../lib/estimate'
import type { FlexEntry } from '../lib/flex'

/**
 * What the app is opened on for a shot: the caches a synced phone would hold.
 *
 * Either a snapshot of the owner's own history (`npm run shots -- --refresh-data`
 * writes one under .scratch/, out of git) or, with none on disk, the made-up
 * history below. The made-up one is shaped like a real one on purpose: weigh-ins
 * that wobble a pound a day around a slow gain with a cut in the middle, gaps
 * where a week was missed, lifts that climb and stall. Three flat weeks draw a
 * chart that hides every problem a real one shows.
 */
export type ShotData = {
  workouts: WorkoutRow[]
  bodyweight: BodyWeightEntry[]
  measurements: MeasurementEntry[]
  calories: CalorieEntry[]
  flexibility: FlexEntry[]
  cardio: CardioEntry[]
  durations: SessionDuration[]
  /** The account's synced settings (height, goals, profile), keys and tokens removed. */
  settings: Record<string, unknown>
}

const WEEKS = 40

/** A small seeded generator, so the same day draws the same history twice. */
function mulberry(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const round1 = (n: number) => Math.round(n * 10) / 10

/** Where a lift starts, by plan key; anything unlisted starts light. */
const START_LBS: Record<string, number> = {
  incline_bench: 80,
  flat_bench: 90,
  machine_overhead_press: 70,
  db_overhead_press: 60,
  leg_press: 230,
  hamstring_curl: 80,
  weighted_pullups: 10,
  incline_db_curl: 40,
  hammer_curl: 40,
  cable_crunch: 70,
  weighted_situp: 15,
}

export function seededData(today: Date = new Date()): ShotData {
  const rand = mulberry(20261124)
  const dayAt = (back: number) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    d.setDate(d.getDate() - back)
    return d
  }
  const total = WEEKS * 7

  // Weight: a slow gain, a five-week cut two thirds of the way in, then gaining
  // again; a pound of day-to-day wobble on top, and a missed week.
  const trendAt = (back: number) => {
    const t = (total - back) / total
    const cut = t > 0.55 && t < 0.68 ? (t - 0.55) * 46 : t >= 0.68 ? 6 - (t - 0.68) * 9 : 0
    return 166 + t * 13 - Math.max(0, cut)
  }
  const bodyweight: BodyWeightEntry[] = []
  for (let back = total; back >= 0; back--) {
    const missedWeek = back > 120 && back < 128
    if (missedWeek || rand() > 0.62) continue
    bodyweight.push({ date: iso(dayAt(back)), weightLbs: round1(trendAt(back) + (rand() - 0.5) * 2.4) })
  }

  // A tape reading every ten days or so, drifting with the weight.
  const measurements: MeasurementEntry[] = []
  for (let back = total - 3; back >= 0; back -= 8 + Math.floor(rand() * 5)) {
    const lean = (trendAt(back) - 166) / 13
    const bf = round1(15.2 + lean * 2.6 + (rand() - 0.5) * 0.9)
    measurements.push({
      date: iso(dayAt(back)),
      waistIn: round1(32.6 + lean * 1.3 + (rand() - 0.5) * 0.4),
      neckIn: round1(15.1 + lean * 0.4),
      bodyFatPct: bf,
    })
  }

  const calories: CalorieEntry[] = []
  for (let back = total; back >= 0; back--) {
    if (rand() > 0.86) continue
    const d = dayAt(back)
    const weekend = d.getDay() === 0 || d.getDay() === 6
    calories.push({
      date: iso(d),
      calories: Math.round((2850 + (weekend ? 250 : 0) + (rand() - 0.5) * 700) / 10) * 10,
    })
  }

  // Three lifts a week, rotating through the plan's days. Each exercise climbs
  // a little under a percent a week, stalls now and then, and loses reps across
  // its sets the way a real session does.
  const workouts: WorkoutRow[] = []
  const durations: SessionDuration[] = []
  const days: DayType[] = DAY_TYPES.filter((d) => DEFAULT_PLAN[d].exercises.length > 0)
  let session = 0
  for (let back = total; back >= 1; back--) {
    const d = dayAt(back)
    if (![1, 3, 5].includes(d.getDay()) || rand() > 0.9) continue
    const dayType = days[session % days.length]
    const week = (total - back) / 7
    const date = iso(d)
    for (const ex of DEFAULT_PLAN[dayType].exercises) {
      const start = START_LBS[ex.key] ?? 30
      const step = ex.increment ?? 5
      const stalled = Math.floor(week / 9) * 0.02
      const weight = ex.repsOnly
        ? null
        : Math.max(step, Math.round((start * (1 + week * 0.008 - stalled)) / step) * step)
      for (let set = 1; set <= ex.sets; set++) {
        const fade = Math.floor(rand() * set * 0.9)
        workouts.push({
          session_id: `seed-${date}`,
          date,
          day_type: dayType,
          exercise: ex.key,
          set_number: set,
          weight_lbs: weight,
          reps: Math.max(1, ex.repMax - 1 - fade + (rand() > 0.7 ? 1 : 0)),
          notes: '',
          is_historical: false,
        })
      }
    }
    durations.push({
      date,
      kind: 'workout',
      dayType,
      totalSec: Math.round(3300 + rand() * 900),
      restSec: Math.round(1500 + rand() * 400),
    })
    session++
  }

  const flexibility: FlexEntry[] = []
  for (let back = total - 2; back >= 0; back -= 3 + Math.floor(rand() * 4)) {
    const t = (total - back) / total
    const split = Math.round(96 + t * 17 + (rand() - 0.5) * 4)
    flexibility.push({
      date: iso(dayAt(back)),
      splitDeg: null,
      coldSplitDeg: split - 6,
      warmSplitDeg: split,
      tailorsLeftDeg: null,
      tailorsRightDeg: null,
      tailorsWarmLeftDeg: Math.round(24 - t * 8 + (rand() - 0.5) * 3),
      tailorsWarmRightDeg: Math.round(27 - t * 8 + (rand() - 0.5) * 3),
    })
    durations.push({ date: iso(dayAt(back)), kind: 'stretch', totalSec: Math.round(1500 + rand() * 500), restSec: 400 })
  }

  const cardio: CardioEntry[] = []
  for (let back = 70; back >= 0; back -= 3 + Math.floor(rand() * 5)) {
    const run = rand() > 0.4
    const minutes = Math.round(20 + rand() * 25)
    cardio.push({
      id: `seed-cardio-${back}`,
      date: iso(dayAt(back)),
      kind: run ? 'run' : 'bike',
      minutes,
      distanceMi: run ? round1(minutes / 9.5) : undefined,
    })
  }

  return { workouts, bodyweight, measurements, calories, flexibility, cardio, durations, settings: { heightIn: 70 } }
}

/**
 * Put a history into this origin's localStorage the way a synced phone holds
 * it, so the app opens signed in with nowhere to sync to. The backend address
 * points at a closed local port: nothing the shots do can reach the real one.
 */
export function writeData(data: ShotData, mode: 'dark' | 'light') {
  localStorage.clear()
  const put = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))
  put('wt.settings', {
    ...data.settings,
    apiUrl: 'http://127.0.0.1:9/exec',
    openAiKey: '',
    chatToken: '',
    accountToken: '',
    coachEnabled: false,
    accountMode: 'legacy',
    setupComplete: true,
    tourDone: true,
  })
  put('wt:theme', { mode })
  put('wt.cache.workouts', data.workouts)
  put('wt.cache.bodyweight', data.bodyweight)
  put('wt.cache.measurements', data.measurements)
  put('wt.cache.calories', data.calories)
  put('wt.cache.flex', data.flexibility)
  put('wt.cache.cardio', data.cardio)
  put('wt.cache.durations', data.durations)
}
