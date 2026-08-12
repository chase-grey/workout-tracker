import { describe, expect, it } from 'vitest'
import { dequeued, enqueued, newWrite, normalizeQueue, supersedes, type QueuedWrite } from './outbox'

const cal = (date: string, calories: number, id: string): QueuedWrite =>
  newWrite({ type: 'calorie', entry: { date, calories } }, id)

const weigh = (date: string, id: string): QueuedWrite =>
  newWrite({ type: 'bodyweight', entry: { date, weightLbs: 170 } }, id)

const note = (exercise: string, notes: string, id: string): QueuedWrite =>
  newWrite({ type: 'notes', edit: { session: 's1', exercise, notes } }, id)

describe('supersedes', () => {
  it('keys a calorie write by its date, so only same-day totals collapse', () => {
    expect(supersedes({ type: 'calorie', entry: { date: '2026-08-07', calories: 500 } })).toBe(
      'calorie:2026-08-07',
    )
  })

  it('keys a note rewrite by the exercise log it rewrites', () => {
    expect(
      supersedes({
        type: 'notes',
        edit: { session: 's1', exercise: 'leg_press', notes: 'discomfort: knee' },
      }),
    ).toBe('notes:s1:leg_press')
  })

  it('leaves appends standing on their own', () => {
    expect(supersedes({ type: 'bodyweight', entry: { date: '2026-08-07', weightLbs: 170 } })).toBeNull()
  })
})

describe('enqueued', () => {
  it('keeps only the newest running total for a date', () => {
    const q = enqueued(enqueued([], cal('2026-08-07', 500, 'a')), cal('2026-08-07', 1000, 'b'))
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ id: 'b', entry: { calories: 1000 } })
  })

  it('keeps a different date pending alongside', () => {
    const q = enqueued(enqueued([], cal('2026-08-06', 4000, 'a')), cal('2026-08-07', 500, 'b'))
    expect(q.map((w) => w.id)).toEqual(['a', 'b'])
  })

  it('keeps only the newest note for an exercise log, which carries the whole note', () => {
    const q = enqueued(
      enqueued([], note('leg_press', 'discomfort: knee', 'a')),
      note('leg_press', 'discomfort: knee, hip', 'b'),
    )
    expect(q).toHaveLength(1)
    expect(q[0]).toMatchObject({ id: 'b', edit: { notes: 'discomfort: knee, hip' } })
  })

  it('keeps a note on a different exercise pending alongside', () => {
    const q = enqueued(
      enqueued([], note('leg_press', 'discomfort: knee', 'a')),
      note('barbell_squat', 'discomfort: knee', 'b'),
    )
    expect(q.map((w) => w.id)).toEqual(['a', 'b'])
  })

  it('never collapses appends — two weigh-ins are two rows', () => {
    const q = enqueued(enqueued([], weigh('2026-08-06', 'a')), weigh('2026-08-07', 'b'))
    expect(q).toHaveLength(2)
  })

  it('appends in order, so writes are delivered as they were made', () => {
    const q = enqueued(enqueued([], weigh('2026-08-06', 'a')), cal('2026-08-07', 500, 'b'))
    expect(q.map((w) => w.id)).toEqual(['a', 'b'])
  })
})

describe('dequeued', () => {
  it('removes only the delivered write', () => {
    const q = [cal('2026-08-07', 500, 'a'), weigh('2026-08-07', 'b')]
    expect(dequeued(q, 'a').map((w) => w.id)).toEqual(['b'])
  })

  it('is a no-op when a newer write already superseded the id', () => {
    const q = [cal('2026-08-07', 1000, 'b')]
    expect(dequeued(q, 'a')).toEqual(q)
  })
})

describe('normalizeQueue', () => {
  it('stamps an id on writes queued before ids existed', () => {
    const legacy = [{ type: 'calorie', entry: { date: '2026-08-07', calories: 500 } }]
    const q = normalizeQueue(legacy, () => 'fresh')
    expect(q).toEqual([{ type: 'calorie', entry: { date: '2026-08-07', calories: 500 }, id: 'fresh' }])
  })

  it('leaves an existing id alone', () => {
    expect(normalizeQueue([cal('2026-08-07', 500, 'a')], () => 'fresh')[0].id).toBe('a')
  })

  it('drops junk rather than failing the whole queue', () => {
    const q = normalizeQueue([null, 'nope', { noType: true }, cal('2026-08-07', 500, 'a')], () => 'fresh')
    expect(q.map((w) => w.id)).toEqual(['a'])
  })

  it('treats a non-array (corrupt storage) as empty', () => {
    expect(normalizeQueue({ type: 'calorie' }, () => 'fresh')).toEqual([])
  })
})
