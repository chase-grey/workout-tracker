import { toISODate, parseISODate, weekStartISO } from './dates'

/** A single side-splits flexibility log entry. */
export type FlexEntry = {
  date: string /* YYYY-MM-DD */
  angleDeg: number | null
  note?: string
}

export type FlexStats = {
  sessionsThisWeek: number // entries whose date is in the current Mon–Sun week
  weeklyGoal: number // default 2
  latestAngle: number | null // most recent entry that has a non-null angle
  bestAngle: number | null // max non-null angle ever
  goalDeg: number // default 180
  slopePerWeek: number // least-squares slope of angle vs weeks
  etaWeeks: number | null // weeks to reach goalDeg at current pace; null if not improving
  etaDate: string | null // ISO; null if etaWeeks null
}

const MS_PER_WEEK = 7 * 86400000

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export function flexStats(
  entries: FlexEntry[],
  today: Date = new Date(),
  opts?: { goalDeg?: number; weeklyGoal?: number },
): FlexStats {
  const goalDeg = opts?.goalDeg ?? 180
  const weeklyGoal = opts?.weeklyGoal ?? 2

  const todayISO = toISODate(today)
  const thisWeek = weekStartISO(todayISO)

  // Sessions logged in the current Monday–Sunday week (angle optional).
  const sessionsThisWeek = entries.filter(
    (e) => weekStartISO(e.date) === thisWeek,
  ).length

  // Entries that carry an actual measurement.
  const measured = entries.filter(
    (e): e is FlexEntry & { angleDeg: number } => e.angleDeg != null,
  )

  // Best (max) angle ever recorded.
  const bestAngle = measured.length
    ? Math.max(...measured.map((e) => e.angleDeg))
    : null

  // Latest angle = the measured entry with the greatest date.
  let latestAngle: number | null = null
  let latestDate: string | null = null
  for (const e of measured) {
    if (latestDate === null || e.date > latestDate) {
      latestDate = e.date
      latestAngle = e.angleDeg
    }
  }

  // Least-squares slope of angle (y) vs weeks-since-first-measurement (x).
  let slopePerWeek = 0
  if (measured.length >= 2) {
    const firstDate = measured.reduce(
      (min, e) => (e.date < min ? e.date : min),
      measured[0].date,
    )
    const x0 = parseISODate(firstDate).getTime()
    const pts = measured.map((e) => ({
      x: (parseISODate(e.date).getTime() - x0) / MS_PER_WEEK,
      y: e.angleDeg,
    }))
    const n = pts.length
    const sumX = pts.reduce((s, p) => s + p.x, 0)
    const sumY = pts.reduce((s, p) => s + p.y, 0)
    const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0)
    const sumXX = pts.reduce((s, p) => s + p.x * p.x, 0)
    const denom = n * sumXX - sumX * sumX
    if (denom !== 0) {
      slopePerWeek = round3((n * sumXY - sumX * sumY) / denom)
    }
  }

  // ETA to goal.
  let etaWeeks: number | null = null
  let etaDate: string | null = null
  if (latestAngle != null && latestAngle >= goalDeg) {
    etaWeeks = 0
    etaDate = todayISO
  } else if (slopePerWeek > 0 && latestAngle != null) {
    etaWeeks = (goalDeg - latestAngle) / slopePerWeek
    const eta = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    eta.setDate(eta.getDate() + Math.round(etaWeeks * 7))
    etaDate = toISODate(eta)
  }

  return {
    sessionsThisWeek,
    weeklyGoal,
    latestAngle,
    bestAngle,
    goalDeg,
    slopePerWeek,
    etaWeeks,
    etaDate,
  }
}
