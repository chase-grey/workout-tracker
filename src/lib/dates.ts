/** Date helpers. All weeks are Monday–Sunday, computed in local time. */

export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Parse a `YYYY-MM-DD` string as a local date (no timezone drift). */
export function parseISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** The Monday (local midnight) of the week containing `d`. */
export function mondayOf(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = date.getDay() // 0 = Sun … 6 = Sat
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  return date
}

/** ISO date of the Monday of the week containing `dateStr`. */
export function weekStartISO(dateStr: string): string {
  return toISODate(mondayOf(parseISODate(dateStr)))
}

/** Every Monday ISO string from `startISO` through `endISO`, inclusive. */
export function enumerateWeeks(startISO: string, endISO: string): string[] {
  const out: string[] = []
  const cur = parseISODate(startISO)
  const end = parseISODate(endISO)
  while (cur <= end) {
    out.push(toISODate(cur))
    cur.setDate(cur.getDate() + 7)
  }
  return out
}
