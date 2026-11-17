/**
 * The way back from an AI's change: the plan and weekly goals as they stood
 * before the last one was applied, kept on this device for a week.
 *
 * One snapshot, the latest — undo is for "that wasn't what I meant", noticed in
 * the first workout or two, not a history to walk back through. It restores the
 * whole plan, so an edit made by hand after the AI's is undone with it; the
 * Settings row says when the change was made so that isn't a surprise.
 *
 * Kept in localStorage rather than synced settings: it's a safety net for the
 * phone that pasted the reply, and a plan's worth of JSON has no business in
 * every settings sync.
 */

import type { Plan } from '../../config/plan'
import type { Profile } from '../profile'

export type AiChangeSnapshot = {
  /** ISO timestamp the change was applied. */
  at: string
  /** What the AI said the change was. */
  summary: string
  plan: Plan
  /** The weekly-goal history before the change, when the change touched it. */
  weeklyGoals?: Profile['weeklyGoals']
}

/** How long an AI change can be undone. */
export const UNDO_DAYS = 7

const KEY = 'wt.lastAiChange'
const CONSENT_KEY = 'wt.companionConsent'

type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function store(): KV | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function saveAiChange(snap: AiChangeSnapshot, kv: KV | null = store()): void {
  try {
    kv?.setItem(KEY, JSON.stringify(snap))
  } catch {
    // A full or blocked store costs only the undo.
  }
}

/** The last AI change, while it's still inside the undo window. */
export function lastAiChange(now: Date = new Date(), kv: KV | null = store()): AiChangeSnapshot | null {
  try {
    const raw = kv?.getItem(KEY)
    if (!raw) return null
    const snap = JSON.parse(raw) as AiChangeSnapshot
    const age = now.getTime() - new Date(snap.at).getTime()
    if (!snap.plan || !(age >= 0 && age <= UNDO_DAYS * 86_400_000)) return null
    return snap
  } catch {
    return null
  }
}

export function clearAiChange(kv: KV | null = store()): void {
  try {
    kv?.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

/** Whether this device has agreed, once, to its training data going to a chat AI. */
export function hasCompanionConsent(kv: KV | null = store()): boolean {
  try {
    return kv?.getItem(CONSENT_KEY) != null
  } catch {
    return false
  }
}

export function giveCompanionConsent(now: Date = new Date(), kv: KV | null = store()): void {
  try {
    kv?.setItem(CONSENT_KEY, now.toISOString())
  } catch {
    // Asked again next time.
  }
}
