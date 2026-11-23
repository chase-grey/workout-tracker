/**
 * Which cards a page shows and in what order, as the person has arranged them
 * (see components/EditableStack).
 *
 * Kept the way lib/homeTiles keeps the tiles: an order and the ids taken off,
 * not the cards themselves, because what's available moves underneath — a
 * pillar switched on, a card that ships later. A card the saved order has
 * never seen goes in where the default order has it, after its nearest
 * neighbour that is showing.
 *
 * Some cards are off until asked for (`optional`): a Progress chart on Today.
 * Those are shown only once added.
 *
 * Pure module — no React/DOM.
 */

export type CardLayout = {
  /** Shown card ids, front to back. */
  order: string[]
  /** Cards taken off that would otherwise show. */
  removed: string[]
  /** Optional cards put on. */
  added?: string[]
}

export type CardSpec = {
  id: string
  /** Off until added. */
  optional?: boolean
}

const EMPTY: CardLayout = { order: [], removed: [] }

function isShown(c: CardSpec, layout: CardLayout): boolean {
  return c.optional ? (layout.added ?? []).includes(c.id) : !layout.removed.includes(c.id)
}

/** The ids to show, in order. `available` is every card there could be, in the default order. */
export function arrangeCards(available: CardSpec[], layout: CardLayout | undefined): string[] {
  const l = layout ?? EMPTY
  const shown = available.filter((c) => isShown(c, l)).map((c) => c.id)
  const rank = new Map(l.order.map((id, i) => [id, i]))
  const out = shown.filter((id) => rank.has(id)).sort((a, b) => rank.get(a)! - rank.get(b)!)
  shown.forEach((id, i) => {
    if (rank.has(id)) return
    // After the nearest card ahead of it in the default order that's already placed.
    let at = -1
    for (let j = i - 1; j >= 0 && at === -1; j--) at = out.indexOf(shown[j])
    out.splice(at + 1, 0, id)
  })
  return out
}

/** The ids `available` holds that aren't showing: what adding offers. */
export function hiddenCards(available: CardSpec[], layout: CardLayout | undefined): string[] {
  const l = layout ?? EMPTY
  return available.filter((c) => !isShown(c, l)).map((c) => c.id)
}

/** The layout after dragging the card at `from` of `shown` to `to`. */
export function withCardMoved(layout: CardLayout | undefined, shown: string[], from: number, to: number): CardLayout {
  const order = [...shown]
  const [id] = order.splice(from, 1)
  order.splice(to, 0, id)
  return { ...(layout ?? EMPTY), order }
}

/** The layout after taking `id` off. */
export function withCardRemoved(layout: CardLayout | undefined, shown: string[], id: string): CardLayout {
  const l = layout ?? EMPTY
  return {
    order: shown.filter((x) => x !== id),
    removed: l.removed.includes(id) ? l.removed : [...l.removed, id],
    added: (l.added ?? []).filter((x) => x !== id),
  }
}

/** The layout after putting `id` on, at the end. */
export function withCardAdded(layout: CardLayout | undefined, shown: string[], id: string): CardLayout {
  const l = layout ?? EMPTY
  return {
    order: [...shown.filter((x) => x !== id), id],
    removed: l.removed.filter((x) => x !== id),
    added: [...(l.added ?? []).filter((x) => x !== id), id],
  }
}

/**
 * `items` in a saved order: the ones the order names first, as it has them,
 * then the rest as they came. For a list that is only ever reordered — the
 * week's goals.
 */
export function orderBy<T>(items: T[], key: (item: T) => string, order: readonly string[] | undefined): T[] {
  if (!order?.length) return items
  const rank = new Map(order.map((id, i) => [id, i]))
  const known = items.filter((it) => rank.has(key(it))).sort((a, b) => rank.get(key(a))! - rank.get(key(b))!)
  return [...known, ...items.filter((it) => !rank.has(key(it)))]
}
