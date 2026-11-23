/**
 * The amounts the food card's buttons add, as the person has set them.
 *
 * One list per row of buttons, signed: `500` is a +500 button, `-100` a −100
 * one. Unset is the shipped row. A list emptied of every amount falls back to
 * the shipped row too, since a card with no buttons can't log anything.
 *
 * Pure module — no React/DOM.
 */

import type { Macro } from './calories'

export const DEFAULT_CALORIE_ADDS: readonly number[] = [100, 500, -100]

export const DEFAULT_MACRO_ADDS: Record<Macro, readonly number[]> = {
  protein: [10, 25, -10],
  carbs: [10, 25, -10],
  fat: [5, 10, -5],
}

/** As many buttons as a row holds at a thumb's width each. */
export const MAX_QUICK_ADDS = 5

/** A saved list made safe to draw: whole, non-zero, no repeats, no more than fit. */
function clean(saved: readonly number[] | undefined, fallback: readonly number[]): number[] {
  const out: number[] = []
  for (const n of saved ?? []) {
    const v = Math.round(Number(n))
    if (Number.isFinite(v) && v !== 0 && !out.includes(v)) out.push(v)
  }
  return out.length ? out.slice(0, MAX_QUICK_ADDS) : [...fallback]
}

export function calorieAdds(saved: readonly number[] | undefined): number[] {
  return clean(saved, DEFAULT_CALORIE_ADDS)
}

export function macroAdds(saved: Partial<Record<Macro, number[]>> | undefined, macro: Macro): number[] {
  return clean(saved?.[macro], DEFAULT_MACRO_ADDS[macro])
}

/** `list` with `amount` on the end, unless it's there already, isn't an amount, or the row is full. */
export function withAmount(list: readonly number[], amount: number): number[] {
  const v = Math.round(amount)
  if (!Number.isFinite(v) || v === 0 || list.includes(v) || list.length >= MAX_QUICK_ADDS) return [...list]
  return [...list, v]
}

/** `list` without `amount`; the last one stays, so the row never empties. */
export function withoutAmount(list: readonly number[], amount: number): number[] {
  if (list.length <= 1) return [...list]
  return list.filter((n) => n !== amount)
}

/** How a button names its amount: +500, −100. */
export function formatAdd(amount: number, unit = ''): string {
  return `${amount < 0 ? '−' : '+'}${Math.abs(amount)}${unit}`
}
