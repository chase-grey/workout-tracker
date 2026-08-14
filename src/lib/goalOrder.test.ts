import { describe, it, expect } from 'vitest'
import { orderGoalUnits, type GoalUnit } from './goalOrder'

type Named = GoalUnit & { name: string }

const unit = (name: string, u: Partial<GoalUnit> = {}): Named => ({
  name,
  done: false,
  doneDate: null,
  eta: null,
  projEta: null,
  lockable: false,
  family: name,
  ...u,
})

const reached = (name: string, doneDate: string | null, family = name): Named =>
  unit(name, { done: true, doneDate, family })

const order = (units: Named[]) => orderGoalUnits(units).map((u) => u.name)

describe('the reached band', () => {
  it('puts every finished goal above every unfinished one', () => {
    expect(
      order([
        unit('committed', { eta: '2026-03-01' }),
        reached('old-win', '2025-01-05'),
        unit('lockable', { lockable: true, projEta: '2026-04-01' }),
        reached('new-win', '2026-02-20'),
        unit('far-off'),
      ]),
    ).toEqual(['new-win', 'old-win', 'committed', 'lockable', 'far-off'])
  })

  it('runs newest first, oldest last', () => {
    expect(
      order([
        reached('jan', '2025-01-10'),
        reached('dec', '2025-12-31'),
        reached('jun', '2025-06-15'),
        reached('feb', '2025-02-02'),
      ]),
    ).toEqual(['dec', 'jun', 'feb', 'jan'])
  })

  it('does not cluster finished goals by family — a family is no reason to sit out of date order', () => {
    expect(
      order([
        reached('split-90', '2025-01-10', 'flex:split'),
        reached('bodyweight-180', '2025-06-01', 'bodyweight'),
        reached('split-100', '2025-11-20', 'flex:split'),
      ]),
    ).toEqual(['split-100', 'bodyweight-180', 'split-90'])
  })

  it('drops a finished goal with no date behind it to the back of the band', () => {
    expect(
      order([reached('six-pack', null), reached('dated', '2024-01-01'), unit('open', { eta: '2026-01-01' })]),
    ).toEqual(['dated', 'six-pack', 'open'])
  })

  it('breaks a same-day tie on the order the goals came in', () => {
    expect(order([reached('a', '2025-05-05'), reached('b', '2025-05-05')])).toEqual(['a', 'b'])
  })
})

describe('the bands below reached', () => {
  it('ranks committed above being-asked above everything else, six-pack last', () => {
    expect(
      order([
        unit('six-pack', { last: true }),
        unit('undated'),
        unit('lockable', { lockable: true, projEta: '2026-01-01' }),
        unit('committed', { eta: '2027-01-01' }),
      ]),
    ).toEqual(['committed', 'lockable', 'undated', 'six-pack'])
  })

  it('orders committed goals by soonest commitment', () => {
    expect(
      order([
        unit('late', { eta: '2026-09-01' }),
        unit('soon', { eta: '2026-03-01' }),
        unit('mid', { eta: '2026-06-01' }),
      ]),
    ).toEqual(['soon', 'mid', 'late'])
  })

  it('clusters a family by its soonest date rather than interleaving it by date', () => {
    // The two squat targets bracket the bench date; they stay together, placed
    // by the nearer of the two.
    expect(
      order([
        unit('squat-1x', { eta: '2026-03-01', family: 'lift:squat' }),
        unit('bench', { eta: '2026-05-01', family: 'lift:bench' }),
        unit('squat-1.5x', { eta: '2026-08-01', family: 'lift:squat' }),
      ]),
    ).toEqual(['squat-1x', 'squat-1.5x', 'bench'])
  })

  it('sends undated goals to the back of their own band', () => {
    expect(
      order([unit('no-pace'), unit('headed-somewhere', { projEta: '2026-04-01' })]),
    ).toEqual(['headed-somewhere', 'no-pace'])
  })

  it('keeps a family split across bands clustered within each band', () => {
    expect(
      order([
        unit('squat-1.5x', { projEta: '2026-02-01', family: 'lift:squat' }),
        unit('squat-1x', { eta: '2026-07-01', family: 'lift:squat' }),
      ]),
    ).toEqual(['squat-1x', 'squat-1.5x'])
  })
})

describe('the ready-to-attempt band', () => {
  it('sits under the finished goals and above every committed one', () => {
    expect(
      order([
        unit('committed', { eta: '2026-03-01' }),
        unit('ready', { ready: true, projEta: '2026-09-01' }),
        reached('done', '2026-02-20'),
        unit('lockable', { lockable: true, projEta: '2026-02-25' }),
      ]),
    ).toEqual(['done', 'ready', 'committed', 'lockable'])
  })

  it('ranks two ready goals by the date they are headed for', () => {
    expect(
      order([
        unit('later', { ready: true, projEta: '2026-06-01', family: 'lift:a' }),
        unit('sooner', { ready: true, projEta: '2026-03-01', family: 'lift:b' }),
      ]),
    ).toEqual(['sooner', 'later'])
  })
})
