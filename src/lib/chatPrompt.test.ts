import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from './chatPrompt'
import { PLAN } from '../config/plan'
import { starterPlan } from '../config/planTemplates'
import { setActiveProfile } from './profileStore'
import type { Profile } from './profile'
import type { CardioEntry } from './cardio'
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

/** Everything switched on, which is what most of these assertions are about. */
const allSkills = { planEdits: true, issues: true }

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt({ today, plan: PLAN, workouts, bodyWeights, streaks, skills: allSkills })

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
    expect(prompt).toContain('only proposes a change')
    expect(prompt).toContain('never report an edit as done')
  })

  // The coach answered a sore-knee report by telling the user to reduce the
  // weight, and the user's next message was "don't make a change based on this".
  // A twinge gets recorded, not programmed around.
  it('tells the coach not to change the program over a discomfort report', () => {
    expect(prompt).toContain('Pain or discomfort is not a request to change the program')
    expect(prompt).toContain('Never propose a plan edit off one')
  })

  // A twinge is usually mentioned hours later, and the app has no control for
  // recording one — so the coach has to be the one to do it, and has to be told
  // that rather than pointing at a button that doesn't exist.
  it('tells the coach to record a discomfort report itself, however late it comes', () => {
    expect(prompt).toContain('flag_discomfort')
    expect(prompt).toContain('long after the workout')
  })

  it('marks a flagged exercise in the logged workouts', () => {
    const flagged = buildSystemPrompt({
      today,
      plan: PLAN,
      workouts: workouts.map((w) =>
        w.exercise === 'incline_bench' ? { ...w, notes: 'discomfort: shoulder' } : w,
      ),
      bodyWeights,
      streaks,
      skills: allSkills,
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

// A tool set is left out of the request when its button is off, so the prompt
// has to stop advertising it — a coach told to "call report_issue" with no such
// tool on its belt reaches for whatever is left, which is how a request for a
// goal became two invented stretches in the first place.
describe('buildSystemPrompt with a tool set switched off', () => {
  const build = (skills: { planEdits: boolean; issues: boolean }) =>
    buildSystemPrompt({ today, plan: PLAN, workouts, bodyWeights, streaks, skills })

  it('drops the plan tools and points at the button that brings them back', () => {
    const p = build({ planEdits: false, issues: true })
    expect(p).not.toContain('update_plan')
    expect(p).not.toContain('update_flex_routine')
    expect(p).toContain('Plan editing is switched off')
    expect(p).toContain('"edit plan" button')
  })

  it('drops report_issue and points at the button that brings it back', () => {
    const p = build({ planEdits: true, issues: false })
    expect(p).not.toContain('report_issue')
    expect(p).toContain('Issue filing is switched off')
    expect(p).toContain('"report issues" button')
  })

  // flag_discomfort has no button: it is the only way a twinge mentioned after
  // the workout gets recorded at all, so it is always on the belt.
  it('keeps flag_discomfort whatever the buttons say', () => {
    for (const skills of [
      { planEdits: false, issues: false },
      { planEdits: false, issues: true },
      { planEdits: true, issues: false },
    ]) {
      const p = build(skills)
      expect(p).toContain('flag_discomfort')
      expect(p).toContain('Pain or discomfort is not a request to change the program')
    }
  })

  it('stops telling the coach not to propose a plan edit it cannot propose', () => {
    const p = build({ planEdits: false, issues: true })
    expect(p).not.toContain('Never propose a plan edit off one')
    expect(p).toMatch(/do not advise dropping the weight/i)
  })
})

// The prompt was written for one person. Anyone else's coach has to be told
// about them instead, and nothing that is only true of the owner.
describe('buildSystemPrompt for someone other than the owner', () => {
  const profile: Profile = {
    name: 'Sam',
    pillars: ['strength', 'cardio'],
    sex: 'female',
    birthYear: 1990,
    strength: { daysPerWeek: 2, equipment: 'dumbbells' },
    weeklyGoals: [{ from: '2026-01-05', goals: { workouts: 2, flex: 0, calDays: 0, cardio: 3 } }],
    calorieGoals: [],
    createdAt: '2026-01-01T00:00:00Z',
  }
  const livePlan = starterPlan(profile.strength!)
  const cardio: CardioEntry[] = [
    { id: 'c1', date: '2026-06-29', kind: 'run', minutes: 30, distanceMi: 3 },
    { id: 'c2', date: '2026-06-24', kind: 'bike', minutes: 45 },
  ]
  const build = (over: Partial<Parameters<typeof buildSystemPrompt>[0]> = {}) => {
    setActiveProfile(over.profile === undefined ? profile : over.profile)
    try {
      return buildSystemPrompt({
        today,
        plan: livePlan,
        workouts: [],
        bodyWeights: [],
        streaks,
        skills: allSkills,
        profile,
        cardio,
        heightIn: 66,
        ...over,
      })
    } finally {
      setActiveProfile(null)
    }
  }

  it('says nothing that is only true of the owner', () => {
    const p = build()
    for (const owned of ['six-pack', '180', '190', 'cable pulldown machine', 'heaviest dumbbell', 'incline weighted sit-up']) {
      expect(p).not.toContain(owned)
    }
  })

  it('describes the person from their profile', () => {
    const p = build()
    expect(p).toContain('## About this person')
    expect(p).toContain('Name: Sam')
    expect(p).toContain('Tracks: strength, cardio')
    expect(p).toContain('female, 36 years old')
    expect(p).toContain(`5'6" tall`)
    expect(p).toContain('Strength: 2 days a week, dumbbells')
  })

  it('does not mention a goal of 0', () => {
    const p = build()
    expect(p).toContain('Weekly-goal streak (weeks hitting 2 workouts + 3 cardio days): 7')
    expect(p).not.toContain('stretch sessions')
    expect(p).not.toContain('calories')
  })

  it('renders the live plan, not the shipped one', () => {
    const p = build()
    expect(p).toContain('goblet squat')
    expect(p).not.toContain('cable crunch')
    // The third slot of a two-day week is empty and is skipped.
    expect(p.match(/\(fullbody\):/)).toBeNull()
  })

  it('leaves a pillar that is off out of the data sections', () => {
    const off = { ...profile, pillars: ['cardio' as const] }
    const p = build({ profile: off })
    expect(p).not.toContain('## Workout plan')
    expect(p).not.toContain('## Logged workouts')
    expect(p).toContain('## Cardio')
  })

  it('shows recent cardio only with the pillar on', () => {
    const on = build()
    expect(on).toContain('## Cardio (last 4 weeks)')
    expect(on).toContain('week of 2026-06-29: 30 min')
    expect(on).toContain('2026-06-24: bike, 45 min')
    expect(on).toContain('2026-06-29: run, 30 min · 3 mi')
    const off = build({ profile: { ...profile, pillars: ['strength'] } })
    expect(off).not.toContain('Cardio')
    expect(off).not.toContain('bike')
    // The owner's device has no cardio pillar either.
    expect(build({ profile: null })).not.toContain('## Cardio')
  })

  it('asks a newcomer on the starter plan to be interviewed first', () => {
    expect(build()).toContain('ask about their goals, schedule, equipment and any injuries first')
  })

  it('does not once the plan has been changed or they have trained', () => {
    const edited = { ...livePlan, push: { ...livePlan.push, exercises: livePlan.push.exercises.slice(1) } }
    expect(build({ plan: edited })).not.toContain('ask about their goals')
    const trained = ['a', 'b', 'c'].map((id) => ({ ...workouts[0], session_id: id }))
    expect(build({ workouts: trained })).not.toContain('ask about their goals')
  })
})

describe('buildSystemPrompt for the owner', () => {
  it('keeps the owner-only lines with no profile, and no about-person block', () => {
    const p = buildSystemPrompt({ today, plan: PLAN, workouts, bodyWeights, streaks, skills: allSkills })
    expect(p).toContain('heaviest dumbbell')
    expect(p).toContain('cable pulldown machine')
    expect(p).toContain('incline weighted sit-up')
    expect(p).toContain('hitting 2 workouts + 2 stretch sessions + calories 6/7 at')
    expect(p).not.toContain('## About this person')
    expect(p).not.toContain('ask about their goals')
  })
})
