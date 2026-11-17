import { describe, it, expect } from 'vitest'
import { planFor } from '../../config/planTemplates'
import { PLAN } from '../../config/plan'
import { changeOps, companionStatus, normaliseText, parseCompanionReply } from './parse'

// Two full-body days: push = "full body a", pull = "full body b", fullbody empty.
const plan = planFor({ daysPerWeek: 2, equipment: 'gym', focus: ['chest'], minutes: 45 })
const ctx = { plan }

const block = (...lines: string[]) => ['WT v1', ...lines, 'END'].join('\n')

describe('finding the block', () => {
  it('reads a bare block', () => {
    const p = parseCompanionReply(block('summary: more bench', 'lift set day=push ex=flat_bench sets=4'), ctx)
    expect(companionStatus(p)).toBe('ready')
    expect(p.summary).toBe('more bench')
    expect(changeOps(p)).toEqual([{ op: 'lift.set', day: 'push', key: 'flat_bench', sets: 4 }])
  })

  it('finds a fenced ```wt block inside ChatGPT prose', () => {
    const paste = [
      "Great — thanks for the answers! Here's what I'd change and why:",
      '',
      '- **More chest volume**: a fourth set of bench.',
      '- **Face pulls** for shoulder health.',
      '',
      '```wt',
      'WT v1',
      'summary: a fourth bench set and face pulls on day B',
      'lift set day=push ex=flat_bench sets=4 reps=6-8 rest=150',
      'lift add day=pull name="face pull" sets=3 reps=12-15 rest=60',
      'END',
      '```',
      '',
      'Paste that back into the app and let me know how the first week goes!',
    ].join('\n')
    const p = parseCompanionReply(paste, ctx)
    expect(companionStatus(p)).toBe('ready')
    expect(changeOps(p)).toHaveLength(2)
    expect(p.errors).toEqual([])
  })

  it('reports no block at all', () => {
    const p = parseCompanionReply('Sure! What days can you train?', ctx)
    expect(p.found).toBe(false)
    expect(companionStatus(p)).toBe('none')
  })

  it('treats a block with no END as cut off', () => {
    const p = parseCompanionReply('WT v1\nsummary: x\nlift set day=push ex=flat_bench sets=4\nlift add day=pu', ctx)
    expect(p.found).toBe(true)
    expect(p.complete).toBe(false)
    expect(companionStatus(p)).toBe('truncated')
  })

  it('takes the last block, so a pasted conversation reads the reply not the prompt example', () => {
    const paste = [
      'Example:',
      block('summary: example', 'lift remove day=push ex=cable_fly'),
      'my answers...',
      block('summary: the real one', 'lift set day=pull ex=seated_row sets=3'),
    ].join('\n')
    const p = parseCompanionReply(paste, ctx)
    expect(p.summary).toBe('the real one')
    expect(changeOps(p)).toEqual([{ op: 'lift.set', day: 'pull', key: 'seated_row', sets: 3 }])
  })

  it('refuses another version', () => {
    const p = parseCompanionReply('WT v2\nsummary: x\nEND', ctx)
    expect(p.errors[0].message).toMatch(/v1/)
    expect(companionStatus(p)).toBe('errors')
  })
})

describe('messy text', () => {
  it('undoes smart quotes, dashes, NBSP, zero-width, × and the full-width colon', () => {
    expect(normaliseText('“a” ‘b’ 8–12 8—12 a b x​y 3×10 summary：')).toBe(
      '"a" \'b\' 8-12 8-12 a b xy 3x10 summary:',
    )
  })

  it('reads a block typed through a phone keyboard and a markdown renderer', () => {
    const paste = [
      '> **WT v1**',
      '> * summary： swap fly for dips',
      '> * `lift add day=push name=“dips” sets=3 reps=8–12 rest=90s`',
      '> * lift remove day=push ex=cable​_fly',
      '> **END**',
    ].join('\n')
    const p = parseCompanionReply(paste, ctx)
    expect(p.errors).toEqual([])
    expect(changeOps(p)).toEqual([
      { op: 'lift.add', day: 'push', name: 'dips', sets: 3, repMin: 8, repMax: 12, restSec: 90 },
      { op: 'lift.remove', day: 'push', key: 'cable_fly' },
    ])
  })

  it('takes numbered lines and unquoted multi-word names', () => {
    const p = parseCompanionReply(
      block('1. summary: face pulls', '2. lift add day=pull name=face pull sets=3 reps=15'),
      ctx,
    )
    expect(changeOps(p)).toEqual([
      { op: 'lift.add', day: 'pull', name: 'face pull', sets: 3, repMin: 15, repMax: 15 },
    ])
  })

  it('drops an inline comment', () => {
    const p = parseCompanionReply(block('summary: x', 'lift set day=push ex=flat_bench sets=4  # more volume'), ctx)
    expect(changeOps(p)).toEqual([{ op: 'lift.set', day: 'push', key: 'flat_bench', sets: 4 }])
  })
})

describe('per-line errors', () => {
  it('keeps good lines when one is bad, but reports the bad one by line', () => {
    const p = parseCompanionReply(
      block(
        'summary: x',
        'lift set day=push ex=flat_bench sets=4',
        'lift superset day=push ex=flat_bench',
        'lift remove day=push ex=zercher_squat',
      ),
      ctx,
    )
    expect(companionStatus(p)).toBe('errors')
    expect(changeOps(p)).toHaveLength(1)
    expect(p.errors.map((e) => e.line)).toEqual([4, 5])
    expect(p.errors[0].text).toBe('lift superset day=push ex=flat_bench')
    expect(p.errors[1].message).toMatch(/no "zercher_squat" on push/)
  })

  it('rejects an invented op and names later ones as not yet', () => {
    const p = parseCompanionReply(block('summary: x', 'deload week=4', 'runplan template=c25k'), ctx)
    expect(p.errors[0].message).toMatch(/"deload" isn't an op/)
    expect(p.errors[1].message).toMatch(/isn't supported by this version/)
  })

  it('needs a summary', () => {
    const p = parseCompanionReply(block('lift set day=push ex=flat_bench sets=4'), ctx)
    expect(p.errors).toEqual([{ line: 0, text: '', message: 'the block has no summary: line' }])
  })

  it('refuses a day the plan has nothing on', () => {
    const p = parseCompanionReply(block('summary: x', 'lift add day=fullbody name=dips'), ctx)
    expect(p.errors[0].message).toMatch(/no day "fullbody".*push, pull/)
  })

  it('refuses adding what the day already has', () => {
    const p = parseCompanionReply(block('summary: x', 'lift add day=push name="flat bench press"'), ctx)
    expect(p.errors[0].message).toMatch(/already on push/)
  })

  it('needs something to change on a set', () => {
    const p = parseCompanionReply(block('summary: x', 'lift set day=push ex=flat_bench'), ctx)
    expect(p.errors[0].message).toMatch(/needs sets=/)
  })
})

describe('names and days', () => {
  it('matches an exercise by its name and a day by its label', () => {
    const p = parseCompanionReply(block('summary: x', 'lift set day="full body b" ex="Seated Cable Row" reps=10-12'), ctx)
    expect(changeOps(p)).toEqual([{ op: 'lift.set', day: 'pull', key: 'seated_row', repMin: 10, repMax: 12 }])
  })

  it('matches a near name', () => {
    const p = parseCompanionReply(block('summary: x', 'lift remove day=push ex="lat pulldowns"'), ctx)
    expect(changeOps(p)).toEqual([{ op: 'lift.remove', day: 'push', key: 'cable_pulldown' }])
  })

  it('gives an add the key of an exercise the app knows', () => {
    const p = parseCompanionReply(block('summary: x', 'lift add day=pull name="hammer curls" sets=2'), ctx)
    expect(changeOps(p)).toEqual([{ op: 'lift.add', day: 'pull', name: 'hammer curl', key: 'hammer_curl', sets: 2 }])
  })

  it('makes an unknown add a custom row', () => {
    const p = parseCompanionReply(block('summary: x', 'lift add day=pull name="Prayer Curl" group=Biceps'), ctx)
    expect(changeOps(p)).toEqual([{ op: 'lift.add', day: 'pull', name: 'prayer curl', group: 'biceps' }])
  })

  it('reads a move by anchor or by 1-based position', () => {
    const p = parseCompanionReply(
      block('summary: x', 'lift move day=push ex=cable_fly after=flat_bench', 'lift move day=push ex=calf_raise to=1'),
      ctx,
    )
    expect(changeOps(p)).toEqual([
      { op: 'lift.move', day: 'push', key: 'cable_fly', after: 'flat_bench' },
      { op: 'lift.move', day: 'push', key: 'calf_raise', toIndex: 0 },
    ])
  })
})

describe('numbers', () => {
  it('clamps sets, reps and rest and says so', () => {
    const p = parseCompanionReply(block('summary: x', 'lift set day=push ex=flat_bench sets=12 reps=0-80 rest=15min'), ctx)
    expect(changeOps(p)).toEqual([
      { op: 'lift.set', day: 'push', key: 'flat_bench', sets: 8, repMin: 1, repMax: 50, restSec: 600 },
    ])
    expect(p.adjusted).toEqual([
      'line 3: sets 12 → 8',
      'line 3: reps 0 → 1',
      'line 3: reps 80 → 50',
      'line 3: rest 900 → 600',
    ])
  })

  it('reads rest as seconds, minutes or a clock', () => {
    const rest = (v: string) =>
      (changeOps(parseCompanionReply(block('summary: x', `lift set day=push ex=flat_bench rest=${v}`), ctx))[0] as {
        restSec: number
      }).restSec
    expect([rest('90'), rest('90s'), rest('2 min'), rest('1.5m'), rest('1:30')]).toEqual([90, 90, 120, 90, 90])
  })

  it('swaps a backwards range and reads "8 to 12"', () => {
    const p = parseCompanionReply(block('summary: x', 'lift set day=push ex=flat_bench reps=12-8', 'lift set day=pull ex=seated_row reps=8 to 12'), ctx)
    expect(changeOps(p).map((o) => [(o as { repMin: number }).repMin, (o as { repMax: number }).repMax])).toEqual([
      [8, 12],
      [8, 12],
    ])
  })

  it('reports an unreadable number as an error, and an unknown field as ignored', () => {
    const p = parseCompanionReply(block('summary: x', 'lift set day=push ex=flat_bench reps=AMRAP', 'lift set day=pull ex=seated_row sets=3 weight=135'), ctx)
    expect(p.errors[0].message).toMatch(/reps="AMRAP"/)
    expect(p.adjusted).toEqual(['line 4: ignored weight=135'])
  })
})

describe('weekly, ask', () => {
  it('reads and clamps the weekly goal', () => {
    const p = parseCompanionReply(block('summary: x', 'weekly workouts=9 cardio=3'), ctx)
    expect(changeOps(p)).toEqual([{ op: 'weekly', workouts: 7 }])
    expect(p.adjusted).toEqual(['line 3: ignored weekly cardio=3', 'line 3: weekly workouts 9 → 7'])
  })

  it('refuses the weekly goal where there is none to set', () => {
    const p = parseCompanionReply(block('summary: x', 'weekly workouts=3'), { plan, canSetWeekly: false })
    expect(p.errors[0].message).toMatch(/can't be changed/)
  })

  it('shows questions rather than applying', () => {
    const p = parseCompanionReply(block('ask: how many days can you train?', 'ask: any injuries?'), ctx)
    expect(companionStatus(p)).toBe('ask')
    expect(p.questions).toEqual(['how many days can you train?', 'any injuries?'])
  })
})

describe('the owner plan', () => {
  it('finds one side of a sided pair by name', () => {
    const p = parseCompanionReply(block('summary: x', 'lift set day=push ex="lateral raise (left)" sets=3'), { plan: PLAN })
    expect(changeOps(p)).toEqual([{ op: 'lift.set', day: 'push', key: 'lateral_raise_l', sets: 3 }])
  })
})
