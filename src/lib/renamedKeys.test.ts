import { describe, expect, it } from 'vitest'
import { withRenamedKeys } from './renamedKeys'
import { nextTargets } from './progression'
import { sessionChallenges } from './challenge'
import { exerciseHistory } from './exerciseHistory'
import { exerciseOptions } from './adHocExercise'
import {
  DEFAULT_PLAN,
  DUMBBELL_PAIR,
  GUESSED_PREACHER_CURL_KEY,
  PREACHER_CURL_KEY,
  RENAMED_EXERCISE_KEYS,
  shortExercises,
} from '../config/plan'
import type { WorkoutRow } from '../types'

const row = (over: Partial<WorkoutRow> = {}): WorkoutRow => ({
  session_id: 's1',
  date: '2026-11-15',
  day_type: 'pull',
  exercise: 'incline_db_curl',
  set_number: 1,
  weight_lbs: 60,
  reps: 12,
  notes: '',
  is_historical: false,
  ...over,
})

/** `sets` sets of one weight and rep count in one session. */
const session = (id: string, date: string, weight: number, reps: number, sets = 2, over: Partial<WorkoutRow> = {}) =>
  Array.from({ length: sets }, (_, i) =>
    row({ session_id: id, date, weight_lbs: weight, reps, set_number: i + 1, ...over }),
  )

/** The sheet's last two sessions in the pull day's curl slot, as they were logged. */
const LOGGED = [
  ...session('nov15', '2026-11-15', 60, 12),
  ...session('nov18', '2026-11-18', 70, 10),
]

const TODAY = new Date(2026, 10, 20)

/** The preacher curl machine as pull + legs ships it, at either length. */
const machine = (length: 'short' | 'full' = 'full') => {
  const e = shortExercises(DEFAULT_PLAN.pull.exercises, length).find((x) => x.key === PREACHER_CURL_KEY)
  if (!e) throw new Error('the pull day has no preacher curl machine')
  return e
}

describe('withRenamedKeys', () => {
  it("reads revision 22's key for the preacher curl machine as the key its history is under", () => {
    expect(RENAMED_EXERCISE_KEYS).toEqual({ prayer_curls: 'incline_db_curl' })
    const [out] = withRenamedKeys([row({ exercise: 'prayer_curls', day_type: 'fullbody', notes: 'elbows high' })])
    expect(out).toMatchObject({ exercise: 'incline_db_curl', day_type: 'fullbody', notes: 'elbows high', weight_lbs: 60, reps: 12 })
  })

  it('leaves every other row as it was, the same object', () => {
    const rows = [row(), row({ exercise: 'hammer_curl' }), row({ exercise: 'toString' }), row({ exercise: '' })]
    const out = withRenamedKeys(rows)
    expect(out).toEqual(rows)
    out.forEach((r, i) => expect(r).toBe(rows[i]))
  })

  it('says the same thing however many times it is applied', () => {
    const once = withRenamedKeys([row({ exercise: 'prayer_curls' })])
    expect(withRenamedKeys(once)).toEqual(once)
  })

  it('never renames onto a key that is itself renamed', () => {
    for (const to of Object.values(RENAMED_EXERCISE_KEYS)) expect(RENAMED_EXERCISE_KEYS).not.toHaveProperty(to)
  })
})

describe("the preacher curl machine on pull + legs, read from the slot's own history", () => {
  it('asks for the next rep at 70 after 60x12 twice and then 70x10 twice', () => {
    for (const length of ['short', 'full'] as const) {
      const e = machine(length)
      expect(e.sets).toBe(3)
      expect(nextTargets(LOGGED, [e], { today: TODAY }).get('incline_db_curl')).toEqual({ weightLbs: 70, reps: 11 })
    }
  })

  it('steps 60 to 70 once 12 is held, the step the log took', () => {
    const rows = session('nov15', '2026-11-15', 60, 12)
    const target = nextTargets(rows, [machine()], { today: TODAY }).get('incline_db_curl')
    expect(target?.weightLbs).toBe(70)
  })

  it("goes on adding weight past the 100 lbs a pair of dumbbells stops at", () => {
    const rows = session('top', '2026-11-18', 100, 12)
    expect(nextTargets(rows, [machine()], { today: TODAY }).get('incline_db_curl')?.weightLbs).toBe(110)
    // What the slot did while it carried the dumbbell rack's cap: no more weight,
    // one more rep, for ever.
    const capped = { ...machine(), ...DUMBBELL_PAIR }
    expect(nextTargets(rows, [capped], { today: TODAY }).get('incline_db_curl')).toEqual({ weightLbs: 100, reps: 13 })
  })

  it('shows the whole logged history, best set included', () => {
    const history = exerciseHistory(LOGGED, PREACHER_CURL_KEY)
    expect(history.sessions).toBe(2)
    expect(history.best).toEqual({ date: '2026-11-18', weightLbs: 70, reps: 10 })
    expect(history.recent[0].sets).toEqual([{ weightLbs: 70, reps: 10 }, { weightLbs: 70, reps: 10 }])
  })

  it('scores a session against that target under the machine\'s name', () => {
    const e = machine()
    const added = session('nov25', '2026-11-25', 70, 11, 3)
    const [challenge] = sessionChallenges(LOGGED, added, new Map([[e.key, e]]), new Date(2026, 10, 25))
    expect(challenge).toEqual({ exercise: 'preacher curl machine', target: { weightLbs: 70, reps: 11 }, met: true })
  })

  it("folds a session logged under revision 22's key into the same history", () => {
    // Full body, the one day revision 22 was live, under the key it guessed.
    const stray = session('nov19', '2026-11-19', 70, 11, 2, { exercise: GUESSED_PREACHER_CURL_KEY, day_type: 'fullbody' })
    const raw = [...LOGGED, ...stray]
    // Unread, the machine doesn't know that session happened.
    expect(nextTargets(raw, [machine()], { today: TODAY }).get('incline_db_curl')).toEqual({ weightLbs: 70, reps: 11 })
    const rows = withRenamedKeys(raw)
    expect(exerciseHistory(rows, PREACHER_CURL_KEY).sessions).toBe(3)
    expect(exerciseHistory(rows, GUESSED_PREACHER_CURL_KEY).sessions).toBe(0)
    expect(nextTargets(rows, [machine()], { today: TODAY }).get('incline_db_curl')).toEqual({ weightLbs: 70, reps: 12 })
  })

  it('offers one machine in the add sheet, and the dumbbell curl apart from it', () => {
    const rows = withRenamedKeys([...LOGGED, row({ exercise: GUESSED_PREACHER_CURL_KEY })])
    const options = exerciseOptions(DEFAULT_PLAN, rows, [])
    expect(options.filter((o) => o.name === 'preacher curl machine').map((o) => o.key)).toEqual(['incline_db_curl'])
    expect(options.filter((o) => o.name === 'incline dumbbell curl').map((o) => o.key)).toEqual(['incline_dumbbell_curl'])
    expect(options.map((o) => o.key)).not.toContain('prayer_curls')
    // The dumbbell curl opens on no history: the machine's sets are not its own.
    expect(exerciseHistory(rows, 'incline_dumbbell_curl').sessions).toBe(0)
  })
})
