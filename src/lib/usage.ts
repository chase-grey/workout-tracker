/** Uses of each feature since the last tally reached the backend, keyed by feature id. */
export type UseCounts = Record<string, number>

export function addUse(counts: UseCounts, feature: string, n = 1): UseCounts {
  return { ...counts, [feature]: (counts[feature] ?? 0) + n }
}

/**
 * What's left of `counts` once `sent` has landed. Subtracted rather than
 * cleared: a use counted while the tally was in flight is still owed.
 */
export function minusUses(counts: UseCounts, sent: UseCounts): UseCounts {
  const out: UseCounts = {}
  for (const [k, n] of Object.entries(counts)) {
    const left = n - (sent[k] ?? 0)
    if (left > 0) out[k] = left
  }
  return out
}

/**
 * Whether a DOM event is someone using a control, as opposed to reaching for
 * one. A click on a button or link is a use; a click into a field is only the
 * reach, and the field's `change` is the use. Keystrokes never count.
 */
export function isUseEvent(type: string, target: Element | null): boolean {
  if (!target) return false
  if (type === 'click') return target.closest('button, a, summary') !== null
  if (type === 'change') return target.closest('input, select, textarea') !== null
  return false
}
