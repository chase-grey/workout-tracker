import { describe, expect, it } from 'vitest'
import {
  arrangeCards,
  hiddenCards,
  orderBy,
  withCardAdded,
  withCardMoved,
  withCardRemoved,
  type CardSpec,
} from './cardLayout'

const CARDS: CardSpec[] = [{ id: 'week' }, { id: 'calendar' }, { id: 'calories' }, { id: 'tiles' }, { id: 'muscles', optional: true }]

describe('arrangeCards', () => {
  it('shows the default cards in the default order with nothing saved', () => {
    expect(arrangeCards(CARDS, undefined)).toEqual(['week', 'calendar', 'calories', 'tiles'])
    expect(hiddenCards(CARDS, undefined)).toEqual(['muscles'])
  })

  it('follows the saved order', () => {
    const layout = withCardMoved(undefined, ['week', 'calendar', 'calories', 'tiles'], 3, 0)
    expect(arrangeCards(CARDS, layout)).toEqual(['tiles', 'week', 'calendar', 'calories'])
  })

  it('leaves out what was removed and offers it back', () => {
    const shown = arrangeCards(CARDS, undefined)
    const layout = withCardRemoved(undefined, shown, 'calendar')
    expect(arrangeCards(CARDS, layout)).toEqual(['week', 'calories', 'tiles'])
    expect(hiddenCards(CARDS, layout)).toEqual(['calendar', 'muscles'])
    const back = withCardAdded(layout, arrangeCards(CARDS, layout), 'calendar')
    expect(arrangeCards(CARDS, back)).toEqual(['week', 'calories', 'tiles', 'calendar'])
  })

  it('shows an optional card only once added, and drops it again on removal', () => {
    const shown = arrangeCards(CARDS, undefined)
    const added = withCardAdded(undefined, shown, 'muscles')
    expect(arrangeCards(CARDS, added)).toEqual([...shown, 'muscles'])
    const gone = withCardRemoved(added, arrangeCards(CARDS, added), 'muscles')
    expect(arrangeCards(CARDS, gone)).toEqual(shown)
    expect(hiddenCards(CARDS, gone)).toEqual(['muscles'])
  })

  it('puts a card the order has never seen after its default neighbour', () => {
    // Saved before the calories card existed for this person.
    const layout = { order: ['tiles', 'calendar', 'week'], removed: [] }
    expect(arrangeCards(CARDS, layout)).toEqual(['tiles', 'calendar', 'calories', 'week'])
  })

  it('puts an unseen card first when nothing ahead of it is showing', () => {
    const layout = { order: ['tiles', 'calories'], removed: ['calendar'] }
    expect(arrangeCards(CARDS, layout)).toEqual(['week', 'tiles', 'calories'])
  })

  it('ignores saved ids that are no longer available', () => {
    const layout = { order: ['gone', 'tiles', 'week'], removed: ['also-gone'], added: ['nope'] }
    expect(arrangeCards([{ id: 'week' }, { id: 'tiles' }], layout)).toEqual(['tiles', 'week'])
  })
})

describe('orderBy', () => {
  const items = [{ k: 'workouts' }, { k: 'flex' }, { k: 'calDays' }]
  const key = (i: { k: string }) => i.k

  it('keeps the given order with nothing saved', () => {
    expect(orderBy(items, key, undefined)).toBe(items)
  })

  it('leads with the saved order and trails the rest as they came', () => {
    expect(orderBy(items, key, ['calDays', 'cardio', 'workouts']).map(key)).toEqual(['calDays', 'workouts', 'flex'])
  })
})
