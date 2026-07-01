import type { WorkoutRow } from '../types'

const HEADERS: (keyof WorkoutRow)[] = [
  'session_id',
  'date',
  'day_type',
  'exercise',
  'set_number',
  'weight_lbs',
  'reps',
  'notes',
  'is_historical',
]

function cell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function workoutsToCsv(rows: WorkoutRow[]): string {
  const lines = [HEADERS.join(',')]
  for (const row of rows) lines.push(HEADERS.map((h) => cell(row[h])).join(','))
  return lines.join('\n')
}

/** Trigger a client-side download of `content` as a file. */
export function download(filename: string, content: string, type = 'text/csv'): void {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
