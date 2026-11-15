/**
 * When someone last used the app, the way you'd say it: "today", "yesterday",
 * "3 days ago", then weeks and months. The backend stamps last use to the
 * hour, so anything finer would be pretending.
 */
export function lastSeenLabel(iso: string, now: Date): string {
  const t = new Date(iso).getTime()
  if (!iso || !Number.isFinite(t)) return 'never'
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round((day(now) - day(new Date(t))) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}

/** Whether someone used the app within the last `days` days. */
export function seenWithin(iso: string, now: Date, days: number): boolean {
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && now.getTime() - t <= days * 86_400_000
}

/** Most recently seen first; never-seen last. */
export function byLastSeen<T extends { lastSeen: string }>(people: T[]): T[] {
  const at = (p: T) => {
    const t = new Date(p.lastSeen).getTime()
    return Number.isFinite(t) ? t : -Infinity
  }
  return [...people].sort((a, b) => at(b) - at(a))
}
