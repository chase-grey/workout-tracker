import { describe, expect, it } from 'vitest'
import { keyOf, mergeSync, toICS, upcomingSessions, type RemoteEvent, type SyncEvent } from './calendarSync'
import type { WeekCalendarInput } from './weekCalendar'
import type { WorkoutRow } from '../types'

// Week of Mon 2026-11-16 … Sun 2026-11-22; today is the Wednesday.
const MON = '2026-11-16'
const WED = '2026-11-18'
const THU = '2026-11-19'
const FRI = '2026-11-20'
const SAT = '2026-11-21'
const NEXT_MON = '2026-11-23'

function input(over: Partial<WeekCalendarInput> = {}): Omit<WeekCalendarInput, 'weekStart' | 'plannedCardio'> {
  return {
    today: WED,
    pillars: ['strength', 'flexibility', 'cardio', 'diet'],
    workouts: [],
    liftDays: ['push', 'pull', 'fullbody'],
    liftLabels: { push: 'push', pull: 'pull', fullbody: 'full body' },
    flexEntries: [],
    stretchRotation: ['head_to_toe', 'side_split'],
    stretchLabels: {
      side_split: 'side split',
      head_to_toe: 'head to toe',
      front_split: 'front split',
      pancake: 'pancake',
      bridge: 'bridge',
      shoulders: 'shoulders',
    },
    cardioEntries: [],
    calorieEntries: [],
    calorieGoalOn: () => 3000,
    ...over,
  }
}

const noCardioPlan = () => []
const ev = (pillar: SyncEvent['pillar'], date: string, title: string = pillar): SyncEvent => ({ pillar, date, title })
const remote = (pillar: SyncEvent['pillar'], date: string, title: string = pillar): RemoteEvent => ({
  ...ev(pillar, date, title),
  id: `g-${pillar}-${date}`,
})
const merge = (over: Partial<Parameters<typeof mergeSync>[0]>) =>
  mergeSync({ from: WED, to: '2027-01-10', base: [], app: [], remote: [], locked: new Set(), ...over })

describe('upcomingSessions', () => {
  it('is empty for someone who has chosen no days', () => {
    const up = upcomingSessions(input(), noCardioPlan)
    expect(up.events).toEqual([])
    expect(up.from).toBe(WED)
    expect(up.to).toBe('2027-01-10')
  })

  it('carries the chosen days from today on, and never the calorie target', () => {
    const up = upcomingSessions(input({ pins: { strength: [0, 3], cardio: [5] } }), noCardioPlan, 2)
    expect(up.events.map((e) => `${e.pillar} ${e.date} ${e.title}`)).toEqual([
      `strength ${THU} push`,
      `cardio ${SAT} cardio`,
      `strength ${NEXT_MON} pull`,
      'strength 2026-11-26 full body',
      'cardio 2026-11-28 cardio',
    ])
  })

  it('keeps a session done today, so finishing it does not delete its event', () => {
    const lift = { session_id: 'a', date: WED, day_type: 'push', exercise: 'bench', set_number: 1, reps: 8 } as WorkoutRow
    const up = upcomingSessions(input({ pins: { strength: [2] }, workouts: [lift] }), noCardioPlan, 1)
    expect(up.events).toEqual([ev('strength', WED, 'push')])
  })

  it('marks a week the cardio plan lays out as one the calendar cannot move', () => {
    const up = upcomingSessions(
      input(),
      (week) => (week === MON ? [{ date: FRI, kind: 'run', minutes: 25, label: 'easy run' }] : []),
      2,
    )
    expect(up.events).toEqual([ev('cardio', FRI, 'easy run 25m')])
    expect([...up.locked]).toEqual([`cardio:${MON}`])
  })
})

describe('mergeSync', () => {
  it('writes everything out on the first sync and takes nothing back', () => {
    const plan = merge({ app: [ev('strength', THU, 'push'), ev('cardio', SAT)] })
    expect(plan.create).toEqual([ev('strength', THU, 'push'), ev('cardio', SAT)])
    expect(plan.remove).toEqual([])
    expect(plan.appChanges).toEqual([])
    expect(plan.base).toEqual([keyOf(ev('cardio', SAT)), keyOf(ev('strength', THU))])
    expect(plan.baseChanged).toBe(true)
  })

  it('has nothing to do once both sides hold what was agreed', () => {
    const app = [ev('strength', THU, 'push')]
    const plan = merge({ base: app.map(keyOf), app, remote: [remote('strength', THU, 'push')] })
    expect(plan).toMatchObject({ create: [], update: [], remove: [], appChanges: [], baseChanged: false })
  })

  it('makes an event for a day added in the app', () => {
    const plan = merge({
      base: [keyOf(ev('strength', THU))],
      app: [ev('strength', THU), ev('strength', SAT)],
      remote: [remote('strength', THU)],
    })
    expect(plan.create).toEqual([ev('strength', SAT)])
    expect(plan.appChanges).toEqual([])
  })

  it('deletes the event of a day taken off in the app', () => {
    const plan = merge({ base: [keyOf(ev('strength', THU))], app: [], remote: [remote('strength', THU)] })
    expect(plan.remove).toEqual([`g-strength-${THU}`])
    expect(plan.appChanges).toEqual([])
    expect(plan.base).toEqual([])
  })

  it('brings an event dragged to another day back as that week’s own days', () => {
    const plan = merge({
      base: [keyOf(ev('strength', THU)), keyOf(ev('strength', NEXT_MON))],
      app: [ev('strength', THU), ev('strength', NEXT_MON)],
      // Thursday's lift was moved to Friday in Google.
      remote: [remote('strength', FRI), remote('strength', NEXT_MON)],
    })
    expect(plan.create).toEqual([])
    expect(plan.remove).toEqual([])
    expect(plan.appChanges).toEqual([{ weekStart: MON, pillar: 'strength', weekdays: [4] }])
    expect(plan.base).toEqual([keyOf(ev('strength', FRI)), keyOf(ev('strength', NEXT_MON))])
  })

  it('takes a day off in the app when its event was deleted in the calendar', () => {
    const plan = merge({
      base: [keyOf(ev('flexibility', THU)), keyOf(ev('flexibility', SAT))],
      app: [ev('flexibility', THU), ev('flexibility', SAT)],
      remote: [remote('flexibility', SAT)],
    })
    expect(plan.appChanges).toEqual([{ weekStart: MON, pillar: 'flexibility', weekdays: [5] }])
    expect(plan.create).toEqual([])
  })

  it('keeps both sides’ changes when each made one', () => {
    const plan = merge({
      base: [keyOf(ev('strength', THU))],
      app: [ev('strength', THU), ev('cardio', SAT)], // cardio added in the app
      remote: [remote('strength', FRI)], // lift moved in the calendar
    })
    expect(plan.create).toEqual([ev('cardio', SAT)])
    expect(plan.appChanges).toEqual([{ weekStart: MON, pillar: 'strength', weekdays: [4] }])
  })

  it('retitles an event whose session changed name, and only then', () => {
    const plan = merge({
      base: [keyOf(ev('strength', THU))],
      app: [ev('strength', THU, 'pull')],
      remote: [remote('strength', THU, 'push')],
    })
    expect(plan.update).toEqual([{ id: `g-strength-${THU}`, title: 'pull' }])
    expect(plan.baseChanged).toBe(false)
  })

  it('puts a cardio plan’s session back when the calendar moved it', () => {
    const plan = merge({
      base: [keyOf(ev('cardio', THU))],
      app: [ev('cardio', THU, 'easy run')],
      remote: [remote('cardio', FRI, 'easy run')],
      locked: new Set([`cardio:${MON}`]),
    })
    expect(plan.create).toEqual([ev('cardio', THU, 'easy run')])
    expect(plan.remove).toEqual([`g-cardio-${FRI}`])
    expect(plan.appChanges).toEqual([])
  })

  it('leaves everything outside the window alone', () => {
    const plan = merge({
      base: [keyOf(ev('strength', MON))],
      app: [],
      remote: [remote('strength', MON), remote('strength', '2027-03-01')],
    })
    expect(plan).toMatchObject({ create: [], update: [], remove: [], appChanges: [], base: [] })
  })

  it('manages one event per session and leaves a hand-made copy be', () => {
    const copy = { ...remote('strength', THU), id: 'copy' }
    const plan = merge({ base: [], app: [], remote: [remote('strength', THU), copy] })
    // Neither is removed: the first reads as added in the calendar, the copy is ignored.
    expect(plan.remove).toEqual([])
    expect(plan.appChanges).toEqual([{ weekStart: MON, pillar: 'strength', weekdays: [3] }])
  })

  it('settles: applying a plan to both sides leaves nothing more to do', () => {
    const first = merge({
      base: [keyOf(ev('strength', THU))],
      app: [ev('strength', THU), ev('cardio', SAT)],
      remote: [remote('strength', FRI)],
    })
    // The app now shows Friday's lift and Saturday's cardio; Google has both.
    const app = [ev('strength', FRI), ev('cardio', SAT)]
    const second = merge({ base: first.base, app, remote: [remote('strength', FRI), remote('cardio', SAT)] })
    expect(second).toMatchObject({ create: [], update: [], remove: [], appChanges: [], baseChanged: false })
  })
})

describe('toICS', () => {
  it('writes one all-day event per session with a stable id', () => {
    const ics = toICS([ev('strength', THU, 'push + core')], new Date('2026-11-18T15:04:05.678Z'))
    expect(ics.split('\r\n')).toEqual([
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//workout-tracker//schedule//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:strength-${THU}@workout-tracker`,
      'DTSTAMP:20261118T150405Z',
      'DTSTART;VALUE=DATE:20261119',
      'DTEND;VALUE=DATE:20261120',
      'SUMMARY:push + core',
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
      'END:VCALENDAR',
      '',
    ])
  })

  it('escapes what the format reserves, and rolls the end date over a month', () => {
    const ics = toICS([ev('cardio', '2026-11-30', 'run, bike; swim')])
    expect(ics).toContain('SUMMARY:run\\, bike\\; swim')
    expect(ics).toContain('DTEND;VALUE=DATE:20261201')
  })
})
