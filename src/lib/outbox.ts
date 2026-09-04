import type { BodyWeightEntry, WorkoutRow } from '../types'
import type { Plan } from '../config/plan'
import type { FlexEntry } from './flex'
import type { CalorieEntry } from './calories'
import type { MeasurementEntry } from './bodyComp'
import type { SessionDuration, SessionTimeSamples } from './estimate'
import type { SyncedSettings } from './settingsSync'
import type { NotesEdit } from './discomfort'

/**
 * The durable outbox: writes recorded on disk *before* the network is touched,
 * and removed only once the backend has acknowledged them.
 *
 * The old shape recorded a write only after its POST had already failed, which
 * loses anything interrupted mid-flight — a backgrounded PWA, a sleeping phone,
 * a closed tab. Those don't reject, they just never resolve, so the retry entry
 * was never written and the sheet silently missed the log while the local cache
 * went on showing it.
 */

/** A write to the backend, without the identity the outbox gives it. */
export type WritePayload =
  | { type: 'session'; rows: WorkoutRow[] }
  | { type: 'notes'; edit: NotesEdit }
  | { type: 'bodyweight'; entry: BodyWeightEntry }
  | { type: 'flex'; entry: FlexEntry }
  | { type: 'calorie'; entry: CalorieEntry }
  | { type: 'measurement'; entry: MeasurementEntry }
  | { type: 'duration'; entry: SessionDuration }
  | { type: 'exerciseTimes'; samples: SessionTimeSamples }
  | { type: 'plan'; plan: Plan }
  | { type: 'settings'; settings: SyncedSettings }

/**
 * A queued write. The id is what lets a delivery remove *its own* entry from
 * whatever the queue looks like by the time the POST returns, rather than
 * overwriting the queue with a snapshot taken before the round-trip.
 */
export type QueuedWrite = WritePayload & { id: string }

export function newWrite(payload: WritePayload, id: string): QueuedWrite {
  return { ...payload, id }
}

/**
 * The key a write supersedes earlier pending writes on, or null when it stands
 * on its own.
 *
 * A calorie entry carries a date's whole running total, so an older pending
 * total for that date is not just redundant, it's actively wrong: delivering it
 * after the newer one would roll the sheet back. The plan, settings, and
 * a note rewrite, which carries the exercise's whole note: flag a knee and then
 * a hip and the second write says "knee, hip", so landing the first afterwards
 * would drop the hip again. Everything else appends a row and has to be kept.
 */
export function supersedes(w: WritePayload): string | null {
  if (w.type === 'calorie') return `calorie:${w.entry.date}`
  if (w.type === 'notes') return `notes:${w.edit.session}:${w.edit.exercise}`
  if (w.type === 'plan') return 'plan'
  if (w.type === 'settings') return 'settings'
  return null
}

/** `queue` with `w` appended, dropping any pending write `w` supersedes. */
export function enqueued(queue: QueuedWrite[], w: QueuedWrite): QueuedWrite[] {
  const key = supersedes(w)
  const kept = key === null ? queue : queue.filter((x) => supersedes(x) !== key)
  return [...kept, w]
}

/** `queue` with the write `id` removed — a no-op if something already superseded it. */
export function dequeued(queue: QueuedWrite[], id: string): QueuedWrite[] {
  return queue.filter((w) => w.id !== id)
}

/**
 * Parse a stored queue, discarding anything unrecognisable and stamping an id
 * on entries written before writes carried one, so a queue left over from the
 * previous build still flushes instead of being dropped on the floor.
 */
export function normalizeQueue(raw: unknown, newId: () => string): QueuedWrite[] {
  if (!Array.isArray(raw)) return []
  const out: QueuedWrite[] = []
  for (const w of raw) {
    if (!w || typeof w !== 'object' || typeof (w as WritePayload).type !== 'string') continue
    const entry = w as QueuedWrite
    out.push(entry.id ? entry : { ...entry, id: newId() })
  }
  return out
}
