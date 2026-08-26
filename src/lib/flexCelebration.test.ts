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
    // 111.6° clears both of the ladder's first two rungs, biggest first.
    expect(completedFlexGoals(entries, TODAY)).toEqual([
      { label: '110° split', target: 110, deg: 111.6 },
      { label: '100° split', target: 100, deg: 111.6 },
    ])
  })

  it('does not re-report a goal an earlier day already reached', () => {
    const already: FlexEntry[] = [
      { date: '2026-07-31', splitDeg: null, warmSplitDeg: 111, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-08-05', splitDeg: null, warmSplitDeg: 111.6, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    expect(completedFlexGoals(already, TODAY)).toEqual([])
  })

  it('cheers a fold that closed past a rung, and reads its rungs downward', () => {
    // 76° clears 90 and 80 and stops short of 70. A bare >= would have cheered
    // all three on the first upright photo, since 175 > every target on the ladder.
    const fold: FlexEntry[] = [
      { date: '2026-07-31', splitDeg: null, warmToeTouchDeg: 114, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-08-05', splitDeg: null, warmToeTouchDeg: 76, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    expect(completedFlexGoals(fold, TODAY)).toEqual([
      { label: '80° toe touch', target: 80, deg: 76 },
      { label: '90° toe touch', target: 90, deg: 76 },
    ])
  })

  it('does not cheer a fold rung an earlier, deeper day already took', () => {
    const already: FlexEntry[] = [
      { date: '2026-07-31', splitDeg: null, warmToeTouchDeg: 88, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-08-05', splitDeg: null, warmToeTouchDeg: 86, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    expect(completedFlexGoals(already, TODAY)).toEqual([])
  })

  it('judges the leg-lift goal on the average of the warm pair', () => {
    // 68 and 62 average to 65 — exactly the first rung, and `beats` is strict, so
    // landing on a rung has to count as clearing it.
    const lift: FlexEntry[] = [
      {
        date: '2026-07-31',
        splitDeg: null,
        tailorsLeftDeg: null,
        tailorsRightDeg: null,
        warmLegLiftLeftDeg: 60,
        warmLegLiftRightDeg: 58,
      },
      {
        date: '2026-08-05',
        splitDeg: null,
        tailorsLeftDeg: null,
        tailorsRightDeg: null,
        warmLegLiftLeftDeg: 68,
        warmLegLiftRightDeg: 62,
      },
    ]
    expect(completedFlexGoals(lift, TODAY)).toEqual([{ label: '65° leg lift', target: 65, deg: 65 }])
  })

  it('leads with the rung today cleared by the least, across poses', () => {
    // The split clears 100 by 4; the fold clears 90 by 1. The narrower one is the
    // harder thing that happened, whichever ladder it came off.
    const both: FlexEntry[] = [
      {
        date: '2026-07-31',
        splitDeg: null,
        warmSplitDeg: 95,
        warmToeTouchDeg: 114,
        tailorsLeftDeg: null,
        tailorsRightDeg: null,
      },
      {
        date: '2026-08-05',
        splitDeg: null,
        warmSplitDeg: 104,
        warmToeTouchDeg: 89,
        tailorsLeftDeg: null,
        tailorsRightDeg: null,
      },
    ]
    expect(completedFlexGoals(both, TODAY).map((g) => g.label)).toEqual([
      '90° toe touch',
      '100° split',
    ])
  })

  it('reports every goal crossed at once, biggest target first', () => {
    const leap: FlexEntry[] = [
      { date: '2026-07-31', splitDeg: null, warmSplitDeg: 95, tailorsLeftDeg: null, tailorsRightDeg: null },
      { date: '2026-08-05', splitDeg: null, warmSplitDeg: 152, tailorsLeftDeg: null, tailorsRightDeg: null },
    ]
    expect(completedFlexGoals(leap, TODAY).map((g) => g.target)).toEqual([150, 135, 120, 110, 100])
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
    expect(cheers[0].title).toBe('goals complete!')
    expect(cheers[0].subtitle).toBe('110° split — hit it at 111.6°.')
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

describe('anglePRs — the head-to-toe poses', () => {
  const h2t = (date: string, fields: Partial<FlexEntry>): FlexEntry => ({
    date,
    splitDeg: null,
    tailorsLeftDeg: null,
    tailorsRightDeg: null,
    ...fields,
  })

  // The fold gets deeper by getting smaller, so a bare max would have cheered
  // the shallowest fold of the week and stayed silent on the deepest.
  it('cheers a deeper fold, which is a lower number', () => {
    const prs = anglePRs(
      [h2t('2026-07-29', { warmToeTouchDeg: 104 }), h2t('2026-08-05', { warmToeTouchDeg: 96 })],
      TODAY,
    )
    expect(prs).toEqual([{ pose: 'toe touch', deg: 96 }])
  })

  it('stays quiet on a shallower fold', () => {
    const prs = anglePRs(
      [h2t('2026-07-29', { warmToeTouchDeg: 96 }), h2t('2026-08-05', { warmToeTouchDeg: 104 })],
      TODAY,
    )
    expect(prs).toEqual([])
  })

  it('cheers a higher leg lift, per side', () => {
    const prs = anglePRs(
      [
        h2t('2026-07-29', { warmLegLiftLeftDeg: 70, warmLegLiftRightDeg: 74 }),
        h2t('2026-08-05', { warmLegLiftLeftDeg: 80, warmLegLiftRightDeg: 72 }),
      ],
      TODAY,
    )
    expect(prs).toEqual([{ pose: 'left leg lift', deg: 80 }])
  })

  it('needs a baseline — the first fold ever logged is not a PR', () => {
    expect(anglePRs([h2t('2026-08-05', { warmToeTouchDeg: 96 })], TODAY)).toEqual([])
  })

  it('ignores the cold readings', () => {
    const prs = anglePRs(
      [h2t('2026-07-29', { coldToeTouchDeg: 130 }), h2t('2026-08-05', { coldToeTouchDeg: 110 })],
      TODAY,
    )
    expect(prs).toEqual([])
  })

  // With the fold counted down and the lift counted up, the raw degrees aren't
  // comparable — so the headline goes to the pose that moved furthest.
  it('leads with the biggest improvement rather than the biggest number', () => {
    const prs = anglePRs(
      [
        h2t('2026-07-29', { warmToeTouchDeg: 120, warmLegLiftLeftDeg: 79 }),
        h2t('2026-08-05', { warmToeTouchDeg: 96, warmLegLiftLeftDeg: 80 }),
      ],
      TODAY,
    )
    expect(prs.map((p) => p.pose)).toEqual(['toe touch', 'left leg lift'])
  })
})
