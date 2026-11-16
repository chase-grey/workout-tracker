/**
 * Starter labels on the icon-only controls: a short word inside the button,
 * beside or under the glyph, for someone new to the app — dropped once they've
 * used that control a few times, because by then the word is noise.
 *
 * Only the controls whose glyph doesn't say what it does get one (see
 * CONTROL_WORDS). A close ×, a back arrow, pause and play, a to-do circle that
 * fills with a check: those read on sight and stay bare. Tap-anywhere-to-advance
 * gets nothing either — it's not a control, and the flow teaches it in one set.
 *
 * Uses are counted per control and synced with the rest of settings, so the
 * phone you learned on and the one you pick up next agree. Pure: no React, no
 * storage (see lib/useControlLabel for the hook).
 */

/** A control that can wear a starter label. One id per meaning, not per button:
 *  the skip mark on an exercise and on a single set is one thing to learn. */
export type ControlId = 'more' | 'auto' | 'history' | 'list' | 'skip' | 'showAll' | 'editTiles' | 'addTile'

export const CONTROL_IDS: readonly ControlId[] = [
  'more',
  'auto',
  'history',
  'list',
  'skip',
  'showAll',
  'editTiles',
  'addTile',
]

/** The word each control wears while it's labelled. Kept short: it sits inside a 44px button. */
export const CONTROL_WORDS: Record<ControlId, string> = {
  more: 'more',
  auto: 'auto',
  history: 'history',
  list: 'list',
  skip: 'skip',
  showAll: 'show all',
  editTiles: 'edit',
  addTile: 'add',
}

export type LabelMode = 'auto' | 'always' | 'never'
export const LABEL_MODES: readonly LabelMode[] = ['auto', 'always', 'never']

export type ControlUses = Partial<Record<ControlId, number>>

/** Uses after which a control drops its label, and where its counter stops. */
export const LABEL_USES = 3

/**
 * The mode in force. Unset follows whose device it is: the owner's looks exactly
 * as it always has, everyone else starts labelled.
 */
export function labelModeFor(mode: LabelMode | undefined, isOwner: boolean): LabelMode {
  return mode ?? (isOwner ? 'never' : 'auto')
}

export function showLabel(
  id: ControlId,
  mode: LabelMode | undefined,
  uses: ControlUses | undefined,
  isOwner: boolean,
): boolean {
  const m = labelModeFor(mode, isOwner)
  if (m === 'always') return true
  if (m === 'never') return false
  return (uses?.[id] ?? 0) < LABEL_USES
}

/** `uses` with one more for `id`, capped; the same object when already at the cap. */
export function bump(uses: ControlUses | undefined, id: ControlId): ControlUses {
  const held = uses ?? {}
  const n = held[id] ?? 0
  if (n >= LABEL_USES) return held
  return { ...held, [id]: n + 1 }
}

/** Whether going from `before` to `after` is the use that retires `id`'s label. */
export function retires(before: ControlUses | undefined, after: ControlUses | undefined, id: ControlId): boolean {
  return (before?.[id] ?? 0) < LABEL_USES && (after?.[id] ?? 0) >= LABEL_USES
}

/** Whether any control has retired its label yet. */
export function anyRetired(uses: ControlUses | undefined): boolean {
  return CONTROL_IDS.some((id) => (uses?.[id] ?? 0) >= LABEL_USES)
}

/**
 * The toast for a label going away. The first since a reset says where to get
 * labels back; after that the name alone is enough.
 */
export function retiredNotice(id: ControlId, firstRetired: boolean): string {
  const word = CONTROL_WORDS[id]
  return firstRetired ? `“${word}” label tidied — bring back in settings` : `“${word}” label tidied`
}

/**
 * Two devices' counters folded together. Uses only go up, so each counter takes
 * the larger side — a phone that hasn't synced can't hand a retired label back.
 * The one exception is a reset from Settings: it stamps `resetAt`, and counters
 * from before the newer stamp lose to it outright, or the other phone's old
 * counts would undo the reset on the next sync.
 */
export function mergeControlUses(
  local: { uses?: ControlUses; resetAt?: string },
  remote: { uses?: ControlUses; resetAt?: string },
): { uses?: ControlUses; resetAt?: string } {
  const lr = local.resetAt ?? ''
  const rr = remote.resetAt ?? ''
  if (lr !== rr) return lr > rr ? local : remote
  if (!local.uses && !remote.uses) return { resetAt: local.resetAt }
  const out: ControlUses = {}
  for (const id of CONTROL_IDS) {
    const n = Math.max(local.uses?.[id] ?? 0, remote.uses?.[id] ?? 0)
    if (n > 0) out[id] = Math.min(n, LABEL_USES)
  }
  return { uses: out, resetAt: local.resetAt }
}
