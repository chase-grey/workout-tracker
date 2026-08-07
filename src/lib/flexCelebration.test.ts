import { describe, it, expect } from 'vitest'
import type { FlexEntry } from './flex'
import {
  anglePRCelebration,
  anglePRs,
  completedFlexGoals,
  flexAngleCelebrations,
  flexGoalCelebration,
} from './flexCelebration'

const TODAY = new Date(2026, 7, 5) // 2026-08-05

/** Two earlier sessions well short of the 100° split, then today's 111.6. */
const entries: FlexEntry[] = [
  {
    date: '2026-07-21',
    splitDeg: null,
    warmSplitDeg: 88,
    tailorsLeftDeg: null,
    tailorsRightDeg: null,
    tailorsWarmLeftDeg: 64.3,
    tailorsWarmRightDeg: 62.9,
  },
  {
    date: '2026-07-31',
    splitDeg: null,
    warmSplitDeg: 95.2,
    tailorsLeftDeg: null,
    tailorsRightDeg: null,
    tailorsWarmLeftDeg: 63.3,
    tailorsWarmRightDeg: 63.4,
  },
  {
    date: '2026-08-05',
    splitDeg: null,
    warmSplitDeg: 111.6,
    tailorsLeftDeg: null,
    tailorsRightDeg: null,
    tailorsWarmLeftDeg: 65,
    tailorsWarmRightDeg: 62,
  },
]

describe('anglePRs', () => {
  it('crowns a pose whose all-time best was beaten today', () => {
    const prs = anglePRs(entries, TODAY)
    expect(prs).toEqual([
      { pose: 'side split', deg: 111.6 },
      { pose: "tailor's left", deg: 65 },
    ])
  })

  it('leaves out a pose that came in under its best', () => {
    // Right tailor's is 62 today against a 63.4 best — not a PR.
    expect(anglePRs(entries, TODAY).some((p) => p.pose === "tailor's right")).toBe(false)
  })

  it('needs a prior reading, so a first-ever angle is not a PR', () => {
    const first: FlexEntry[] = [
      { date: '2026-08-05', splitDeg: null, warmSplitDeg: 90, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    expect(anglePRs(first, TODAY)).toEqual([])
  })

  it('is empty on a day with no measurements', () => {
    expect(anglePRs(entries.slice(0, 2), TODAY)).toEqual([])
  })

  it('counts a legacy untagged reading as the warm one', () => {
    const legacy: FlexEntry[] = [
      { date: '2026-07-31', splitDeg: 95, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-08-05', splitDeg: 99, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    expect(anglePRs(legacy, TODAY)).toEqual([{ pose: 'side split', deg: 99 }])
  })
})

describe('completedFlexGoals', () => {
  it('reports a goal today crossed for the first time', () => {
    expect(completedFlexGoals(entries, TODAY)).toEqual([
      { label: '100° split', target: 100, deg: 111.6 },
    ])
  })

  it('does not re-report a goal an earlier day already reached', () => {
    const already: FlexEntry[] = [
      { date: '2026-07-31', splitDeg: null, warmSplitDeg: 104, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-08-05', splitDeg: null, warmSplitDeg: 111.6, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    expect(completedFlexGoals(already, TODAY)).toEqual([])
  })

  it('reports every goal crossed at once, biggest target first', () => {
    const leap: FlexEntry[] = [
      { date: '2026-07-31', splitDeg: null, warmSplitDeg: 95, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-08-05', splitDeg: null, warmSplitDeg: 152, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    expect(completedFlexGoals(leap, TODAY).map((g) => g.target)).toEqual([150, 135, 120, 100])
  })

  it('judges the tailor\'s goal on the average of the warm pair', () => {
    // 72 and 68 average to 70 — exactly the first tailor's goal.
    const tailors: FlexEntry[] = [
      {
        date: '2026-07-31',
        splitDeg: null,
        tailorsLeftDeg: null,
        tailorsRightDeg: null,
        tailorsWarmLeftDeg: 64,
        tailorsWarmRightDeg: 62,
      },
      {
        date: '2026-08-05',
        splitDeg: null,
        tailorsLeftDeg: null,
        tailorsRightDeg: null,
        tailorsWarmLeftDeg: 72,
        tailorsWarmRightDeg: 68,
      },
    ]
    expect(completedFlexGoals(tailors, TODAY)).toEqual([
      { label: "70° tailor's pose", target: 70, deg: 70 },
    ])
  })

  it('is empty when nothing was measured today', () => {
    expect(completedFlexGoals(entries.slice(0, 2), TODAY)).toEqual([])
  })
})

describe('celebrations', () => {
  it('leads with the completed goal, then the pr', () => {
    const cheers = flexAngleCelebrations(entries, TODAY)
    expect(cheers).toHaveLength(2)
    expect(cheers[0].title).toBe('goal complete!')
    expect(cheers[0].subtitle).toBe('100° split — hit it at 111.6°.')
    expect(cheers[1].title).toBe('new flexibility prs!')
    expect(cheers.every((c) => c.tier === 'epic')).toBe(true)
  })

  it('returns nothing when nothing was earned', () => {
    expect(flexAngleCelebrations(entries.slice(0, 2), TODAY)).toEqual([])
    expect(anglePRCelebration([])).toBeNull()
    expect(flexGoalCelebration([])).toBeNull()
  })

  it('carries the extra wins as detail badges', () => {
    expect(anglePRCelebration(anglePRs(entries, TODAY))!.details).toEqual(["tailor's left — 65°"])
  })
})
