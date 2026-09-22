import type { BodyWeightEntry } from '../types'

/** A response started before a local save or another refresh is obsolete. */
export function reconcileBodyWeights(
  remote: BodyWeightEntry[],
  pending: BodyWeightEntry[],
  local: BodyWeightEntry[],
  revisionAtFetch: number,
  currentRevision: number,
): BodyWeightEntry[] {
  if (revisionAtFetch !== currentRevision) return local
  return mergePendingBodyWeights(remote, pending)
}

/** Keep unconfirmed entries visible without duplicating rows already on the server. */
export function mergePendingBodyWeights(
  remote: BodyWeightEntry[],
  pending: BodyWeightEntry[],
): BodyWeightEntry[] {
  const key = (entry: BodyWeightEntry) => JSON.stringify([entry.date, entry.weightLbs])
  const seen = new Set(remote.map(key))
  const merged = [...remote]
  for (const entry of pending) {
    if (!seen.has(key(entry))) {
      merged.push(entry)
      seen.add(key(entry))
    }
  }
  return merged
}
