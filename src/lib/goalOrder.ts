/**
 * The order the goals panel lays its blocks out in.
 *
 * Split out of the panel because it's the part with rules worth stating and
 * checking: which band a goal is in, and how the bands read internally. The
 * panel supplies one entry per thing it draws and renders whatever comes back.
 *
 * Pure module — no React/DOM.
 */

export type GoalUnit = {
  /** Already achieved — the band that sits above everything else. */
  done: boolean
  /** The day it was achieved, which is how the reached band orders itself. */
  doneDate: string | null
  /** The date it committed to, once locked in. */
  eta: string | null
  /** Where its current pace is headed, when it hasn't committed to a date. */
  projEta: string | null
  /** Being asked to commit — the band just under the committed ones. */
  lockable: boolean
  /**
   * One single away from being finished (see goals.isReadyToAttempt) — the band
   * directly under the reached ones, since it's the only thing in the panel that
   * could be crossed off today.
   */
  ready?: boolean
  /** The family it clusters with inside a dated band. */
  family: string
  /** Sits at the back of whatever band it's in (the six-pack). */
  last?: boolean
}

/**
 * Which band a unit is in. This is the first-order rank, and it's about
 * standing, not dates: reached first, then the ones waiting on an attempt, then
 * committed, then the ones being asked to commit, then everything else, with the
 * six-pack last.
 */
function band(u: GoalUnit): number {
  if (u.done) return 0
  if (u.ready) return 1
  return u.eta ? 2 : u.lockable ? 3 : u.last ? 5 : 4
}

/**
 * The date a unit reads as within its band: its commitment once committed,
 * otherwise where its projection is currently headed.
 */
function dateOf(u: GoalUnit): string | null {
  return u.eta ?? u.projEta
}

/**
 * Sort the panel's blocks. Only inside a band do dates and families get a say.
 *
 * The reached band runs newest first, flat — no family clustering, because a
 * finished goal's date is the only thing left to say about it, so the band reads
 * as the log of what's been done with the thing just cleared on top and the
 * early wins settling toward the bottom.
 *
 * In every other dated band related goals (the two squat targets, a flexibility
 * ladder) cluster into families rather than interleaving by date — each family
 * is placed by its soonest date within that band (its nearest commitment when
 * committed, its nearest projection when not), and its members sit in date order
 * under it. A band uses commitment dates for committed goals and projection
 * dates for the rest, so the two never mix within one family's soonest. Units
 * with no date to project sit at the back of their band in the order they came
 * in — the sort is stable in the sense that ties fall back to that order.
 */
export function orderGoalUnits<T extends GoalUnit>(units: T[]): T[] {
  const rows = units.map((u, i) => ({ u, i }))

  // Per band, the soonest date in each family and where the family first
  // appears — so families sort by their nearest date and ties fall back to the
  // panel's default order. Keyed by band too, so a family split across bands
  // (one target committed, a harder one still projected) clusters within each.
  const key = (u: GoalUnit) => `${band(u)}:${u.family}`
  const familySoonest = new Map<string, string>()
  const familyFirst = new Map<string, number>()
  for (const { u, i } of rows) {
    const k = key(u)
    const d = dateOf(u)
    if (d != null) {
      const cur = familySoonest.get(k)
      if (cur == null || d < cur) familySoonest.set(k, d)
    }
    if (!familyFirst.has(k)) familyFirst.set(k, i)
  }

  return rows
    .sort((a, b) => {
      const ba = band(a.u)
      const bb = band(b.u)
      if (ba !== bb) return ba - bb
      if (ba === 0) {
        // Reached: straight reverse chronological. The six-pack, called by eye
        // with no date behind it, falls to the back.
        const ad = a.u.doneDate
        const bd = b.u.doneDate
        if (ad && bd && ad !== bd) return ad > bd ? -1 : 1
        if (ad && !bd) return -1
        if (!ad && bd) return 1
        return a.i - b.i
      }
      // Within a dated band, order families by their soonest date (dated
      // families ahead of dateless ones), then keep a family's members in date
      // order.
      if (a.u.family !== b.u.family) {
        const sa = familySoonest.get(key(a.u))
        const sb = familySoonest.get(key(b.u))
        if (sa && sb && sa !== sb) return sa < sb ? -1 : 1
        if (sa && !sb) return -1
        if (!sa && sb) return 1
        return familyFirst.get(key(a.u))! - familyFirst.get(key(b.u))!
      }
      const ad = dateOf(a.u)
      const bd = dateOf(b.u)
      if (ad && bd && ad !== bd) return ad < bd ? -1 : 1
      if (ad && !bd) return -1
      if (!ad && bd) return 1
      return a.i - b.i
    })
    .map(({ u }) => u)
}
