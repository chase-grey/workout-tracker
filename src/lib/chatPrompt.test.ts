import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from './chatPrompt'
import type { BodyWeightEntry, StreakState, WorkoutRow } from '../types'

const today = new Date(2026, 6, 1) // 2026-07-01 (local)

const workouts: WorkoutRow[] = [
  {
    session_id: 's1',
    date: '2026-06-15',
    day_type: 'push',
    exercise: 'incline_bench',
    set_number: 1,
    weight_lbs: 135,
    reps: 8,
    notes: '',
    is_historical: false,
  },
  {
    session_id: 's1',
    date: '2026-06-15',
    day_type: 'push',
    exercise: 'incline_bench',
    set_number: 2,
    weight_lbs: 140,
    reps: 6,
    notes: '',
    is_historical: false,
  },
  // Older than 90 days before 2026-07-01 (cutoff ~2026-04-02) — should be excluded.
  {
    session_id: 's0',
    date: '2026-01-01',
    day_type: 'pull',
    exercise: 'barbell_squat',
    set_number: 1,
    weight_lbs: 225,
    reps: 5,
    notes: '',
    is_historical: true,
  },
]

const bodyWeights: BodyWeightEntry[] = [
  { date: '2026-06-20', weightLbs: 178 },
  { date: '2026-01-01', weightLbs: 190 }, // excluded (too old)
]

const streaks: StreakState = { streak: 7, freezes: 2 }

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt({ today, workouts, bodyWeights, streaks })

  it('includes the current date', () => {
    expect(prompt).toContain('2026-07-01')
  })

  it('includes a known exercise name from the plan', () => {
    expect(prompt).toContain('incline bench press')
  })

  it('includes a logged set', () => {
    expect(prompt).toContain('135x8')
    expect(prompt).toContain('140x6')
  })

  it('includes a recent body weight', () => {
    expect(prompt).toContain('178')
  })

  it('includes the streak numbers', () => {
    expect(prompt).toContain('Weekly-goal streak')
    expect(prompt).toContain('freezes available: 2')
  })

  it('excludes workouts older than 90 days', () => {
    expect(prompt).not.toContain('225x5')
    expect(prompt).not.toContain('2026-01-01')
  })

  // The coach once answered "add a flexibility goal at 135°" by inventing a
  // 135-degree stretch, because update_flex_routine was the closest tool it had.
  // The prompt has to name goals as off-limits and send them to report_issue.
  it('sends app changes it cannot make, goals included, to report_issue', () => {
    expect(prompt).toContain('report_issue')
    expect(prompt).toMatch(/goals?/i)
    expect(prompt).toContain('Adding a goal is not adding an exercise')
  })

  it('tells the coach its edits are proposals awaiting approval', () => {
    expect(prompt).toContain('only propose a change')
    expect(prompt).toContain('never report an edit as done')
  })

  // The coach answered a sore-knee report by telling the user to reduce the
  // weight, and the user's next message was "don't make a change based on this".
  // A twinge gets recorded, not programmed around.
  it('tells the coach not to change the program over a discomfort report', () => {
    expect(prompt).toContain('Pain or discomfort is not a request to change the program')
    expect(prompt).toContain('Never propose a plan edit off one')
  })

  it('marks a flagged exercise in the logged workouts', () => {
    const flagged = buildSystemPrompt({
      today,
      workouts: workouts.map((w) =>
        w.exercise === 'incline_bench' ? { ...w, notes: 'discomfort: shoulder' } : w,
      ),
      bodyWeights,
      streaks,
    })
    // Once for the movement, not once per set row carrying the note.
    expect(flagged).toContain('135x8, 140x6 [discomfort: shoulder]')
  })

  it('leaves an unflagged exercise line alone', () => {
    // Scoped to the workouts section: the instructions above it name the flag
    // format, so a bare search for it would match them instead.
    const logged = prompt.slice(prompt.indexOf('## Logged workouts'))
    expect(logged).toContain('135x8, 140x6')
    expect(logged).not.toContain('discomfort')
  })
})
