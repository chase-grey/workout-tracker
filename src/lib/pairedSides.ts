/**
 * Keeping a one-limb-at-a-time movement's two sides together while a workout is
 * being customized.
 *
 * A sided movement ships as two exercises — `lateral_raise_l` and
 * `lateral_raise_r`, each with its own `side` and its own history (see
 * PlannedExercise.side) — so every list that holds exercises holds the two halves
 * as separate rows, and every edit that acts on one row could act on one arm.
 * Nothing stopped it: deleting the left raise in the plan editor left the right
 * one training alone, the coach could add one Copenhagen side without the other,
 * and skipping one side in the session left the other owed. A movement trained on
 * one side only is never what's meant, so these edits act on the pair:
 *
 *   - adding either side adds the other too (unless it's already there),
 *   - removing or skipping either side takes the other with it,
 *   - moving either side carries the other along, keeping the spacing the pair
 *     already had — zero for the hip pairs, which sit side by side, and one
 *     station for the lateral raise, whose halves straddle a tricep station so
 *     the arms land on opposite halves of every circuit round.
 *
 * Pairs are read off the shipped defaults by key rather than off the list's
 * layout (compare sidePair.sidePairPeer, which pairs by position for the set
 * screen): a plan that has already lost one side must not have that side's
 * orphan paired with some unrelated sided movement further down the day.
 *
 * A plan that already holds a lone side — one half deleted before this rule —
 * is left as it is on load rather than healed behind your back: bringing the
 * missing side back would overturn a deletion, and dropping the lone one would
 * delete something kept. Touching it settles it, though: adding the missing side
 * back completes the pair, and removing the lone one leaves nothing half-done.
 *
 * Stretches need none of this: a stretch taken a side at a time is one entry
 * (FlexExercise.perSide) that the flow splits into a left and a right step, so
 * the two sides can't be added, removed or skipped apart in the first place.
 *
 * Pure module — no React/DOM, no storage.
 */

import { ALL_EXERCISES, type PlannedExercise } from '../config/plan'

/** The key with its side suffix taken off: `lateral_raise_l` → `lateral_raise`. */
function stem(key: string): string {
  return key.replace(/_[lr]$/, '')
}

/** Each shipped sided exercise, keyed to its other half. */
const PARTNER_BY_KEY: Map<string, PlannedExercise> = (() => {
  const sided = ALL_EXERCISES.filter((e) => e.side && /_[lr]$/.test(e.key))
  const out = new Map<string, PlannedExercise>()
  for (const e of sided) {
    const other = sided.find((o) => o.side !== e.side && o.key !== e.key && stem(o.key) === stem(e.key))
    if (other) out.set(e.key, other)
  }
  return out
})()

/** The key of `key`'s other side, or null for an exercise trained both sides at once. */
export function sidePartnerKey(key: string): string | null {
  return PARTNER_BY_KEY.get(key)?.key ?? null
}

/** Whether `key` is the half of its pair that's listed first (the left, by convention). */
export function leadsPair(key: string): boolean {
  return PARTNER_BY_KEY.has(key) && ALL_EXERCISES.find((e) => e.key === key)?.side === 'left'
}

/**
 * The other side of `exercise`, prescribed the way it is — same sets, reps, rest,
 * weight step — under the partner's own key, name and side. A name typed for one
 * side is that side's; the partner takes its shipped name rather than a copy that
 * would read "(left)" on the right arm.
 */
export function partnerExercise(exercise: PlannedExercise): PlannedExercise | null {
  const partner = PARTNER_BY_KEY.get(exercise.key)
  if (!partner) return null
  const out: PlannedExercise = { ...exercise, key: partner.key, name: partner.name }
  if (exercise.side) out.side = partner.side
  return out
}

/** `key` and, when `keys` holds it, its other side — what a removal or skip acts on. */
export function pairKeys(keys: readonly string[], key: string): string[] {
  const partner = sidePartnerKey(key)
  return partner && partner !== key && keys.includes(partner) ? [key, partner] : [key]
}

/**
 * `added` and, unless `existing` already has it, its other side — in pair order,
 * left first, whichever half was asked for. Appending these in order keeps a new
 * pair side by side.
 */
export function withPartner(added: PlannedExercise, existingKeys: readonly string[]): PlannedExercise[] {
  const partner = partnerExercise(added)
  if (!partner || existingKeys.includes(partner.key)) return [added]
  return leadsPair(added.key) ? [added, partner] : [partner, added]
}

/**
 * `after` — a reordering of `before` in which the exercises named in `placed`
 * were put where they were meant to go — with each placed side's partner moved
 * back beside it.
 *
 * The partner keeps the spacing the pair had in `before`: as many exercises
 * between the two, on the same side of its mate, as there were. A pair whose
 * halves were both placed is left exactly as placed — that's an order asked for —
 * and so is a lone side, which has nothing to bring along.
 */
export function keepPairsTogether<T extends { key: string }>(
  before: readonly T[],
  after: readonly T[],
  placed: ReadonlySet<string>,
): T[] {
  let out = [...after]
  for (const key of placed) {
    const partnerKey = sidePartnerKey(key)
    if (!partnerKey || placed.has(partnerKey)) continue
    const mateWas = before.findIndex((e) => e.key === key)
    const partnerWas = before.findIndex((e) => e.key === partnerKey)
    if (mateWas < 0 || partnerWas < 0) continue
    const partner = out.find((e) => e.key === partnerKey)
    if (!partner) continue
    const gap = Math.abs(partnerWas - mateWas) - 1
    out = out.filter((e) => e.key !== partnerKey)
    const mate = out.findIndex((e) => e.key === key)
    const at = partnerWas > mateWas ? Math.min(mate + 1 + gap, out.length) : Math.max(mate - gap, 0)
    out.splice(at, 0, partner)
  }
  return out
}

/**
 * Whether `key` can be skipped along with its other side — something outside the
 * pair has to be left to perform (the pair-aware form of skipped.canSkip).
 */
export function canSkipPair(skipped: ReadonlySet<string>, allKeys: readonly string[], key: string): boolean {
  const pair = pairKeys(allKeys, key)
  return allKeys.some((k) => !pair.includes(k) && !skipped.has(k))
}

/** `current` with `key` and its other side skipped, or both put back. */
export function withPairSkipped(
  current: ReadonlySet<string>,
  allKeys: readonly string[],
  key: string,
  skip: boolean,
): Set<string> {
  const next = new Set(current)
  for (const k of pairKeys(allKeys, key)) {
    if (skip) next.add(k)
    else next.delete(k)
  }
  return next
}
