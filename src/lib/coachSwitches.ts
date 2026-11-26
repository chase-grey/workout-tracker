/**
 * The coach's three switches (edit plan, keep context, report issues), kept on
 * the device. Each stays as it was left until it is tapped again: through a
 * reload onto an update, a closed app, a filed report. All three start off on a
 * device that has never set them.
 */
export type CoachSwitches = { planEdits: boolean; keepContext: boolean; issues: boolean }

const KEY = 'wt:coachSwitches'

type Store = Pick<Storage, 'getItem' | 'setItem'>

const deviceStore = (): Store | undefined => {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage
  } catch {
    return undefined
  }
}

export function loadCoachSwitches(store: Store | undefined = deviceStore()): CoachSwitches {
  let kept: Partial<Record<keyof CoachSwitches, unknown>> = {}
  try {
    const parsed: unknown = JSON.parse(store?.getItem(KEY) ?? 'null')
    if (parsed && typeof parsed === 'object') kept = parsed
  } catch {
    // Nothing readable was kept: every switch starts off.
  }
  // Only a kept `true` turns one on, so anything else found there reads as off.
  return { planEdits: kept.planEdits === true, keepContext: kept.keepContext === true, issues: kept.issues === true }
}

export function saveCoachSwitches(switches: CoachSwitches, store: Store | undefined = deviceStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(switches))
  } catch {
    // Storage full or blocked: the switches still hold until the app is closed.
  }
}
