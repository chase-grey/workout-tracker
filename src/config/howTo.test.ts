import { describe, expect, it } from 'vitest'
import { ALL_HOW_TO_VIDEOS, hasHowTo, howTo, videoUrl } from './howTo'
import { ALL_EXERCISES } from './plan'
import { starterPlan } from './planTemplates'
import { FLEX_ROUTINES } from './flexRoutines'
import { buildPlan } from '../lib/planBuilder'
import { MUSCLES, type StrengthSetup } from '../lib/profile'

const EQUIPMENT: StrengthSetup['equipment'][] = ['gym', 'dumbbells', 'bodyweight']

describe('howTo', () => {
  it('has cues for every movement the shipped plan can show', () => {
    const missing = ALL_EXERCISES.filter((e) => !hasHowTo(e.key, e.name)).map((e) => e.key)
    expect(missing).toEqual([])
  })

  it('has cues for every movement a starter plan or a built plan can hand out', () => {
    const missing = new Set<string>()
    for (const equipment of EQUIPMENT) {
      const plans = [starterPlan({ daysPerWeek: 3, equipment })]
      // Each muscle picked alone, at the longest length, reaches the isolation
      // work a balanced build leaves out.
      for (const muscle of MUSCLES) {
        plans.push(buildPlan({ daysPerWeek: 3, equipment, focus: [muscle], minutes: 75 }).plan)
      }
      plans.push(buildPlan({ daysPerWeek: 3, equipment, focus: [], minutes: 75 }).plan)
      for (const plan of plans) {
        for (const day of Object.values(plan)) {
          for (const e of day.exercises) if (!hasHowTo(e.key, e.name)) missing.add(e.key)
        }
      }
    }
    expect([...missing]).toEqual([])
  })

  it('has cues and a video for every stretch in every routine', () => {
    const missing: string[] = []
    for (const routine of Object.values(FLEX_ROUTINES)) {
      for (const block of routine.blocks) {
        for (const e of block.exercises) {
          const h = howTo(e.key, e.name)
          if (h.cues.length === 0 || h.videos.length === 0) missing.push(e.key)
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('reads both sides of a one-limb movement as the one movement', () => {
    const left = howTo('lateral_raise_l', 'lateral raise (left)')
    const right = howTo('lateral_raise_r', 'lateral raise (right)')
    expect(left.name).toBe('lateral raise')
    expect(left.cues.length).toBeGreaterThan(0)
    expect(right.cues).toEqual(left.cues)
  })

  it('picks the dumbbell version of a lift the plans load either way', () => {
    const bar = howTo('flat_bench', 'flat bench press')
    const pair = howTo('flat_bench', 'flat bench press', { dumbbells: true })
    expect(pair.videos[0].id).not.toBe(bar.videos[0].id)
    // A lift with no dumbbell version of its own is unchanged by the flag.
    expect(howTo('hammer_curl', 'hammer curl', { dumbbells: true })).toEqual(howTo('hammer_curl', 'hammer curl'))
  })

  it('finds a hand-added movement by what it is called', () => {
    expect(howTo('custom_1730', 'Lat Pulldown').cues).toEqual(howTo('cable_pulldown', 'lat pulldown').cues)
    expect(howTo('custom_1731', 'push-ups').cues).toEqual(howTo('pushup', 'push-up').cues)
    expect(howTo('custom_1732', 'tailor’s pose').cues.length).toBeGreaterThan(0)
  })

  it('gives a movement it does not know the search alone', () => {
    const h = howTo('custom_1733', 'zercher carry (left)')
    expect(h.cues).toEqual([])
    expect(h.videos).toEqual([])
    expect(h.searchUrl).toBe('https://www.youtube.com/results?search_query=how%20to%20do%20zercher%20carry')
  })

  it('leads the head-to-toe and side-split stretches with matthewismith', () => {
    for (const key of ['tailors_pose', 'horse_squat', 'rolling_feet', 'sciatic_floss', 'pike_block_crush', 'pike_lift', 'calf_stretch', 'puppy_pose', 'shoulder_dislocate', 'shoulder_extension']) {
      expect(howTo(key, key).videos[0].by, key).toBe('matthewismith')
    }
  })

  it('lists only well-formed video ids, and links a chapter by its second', () => {
    for (const v of ALL_HOW_TO_VIDEOS) expect(v.id, v.by).toMatch(/^[A-Za-z0-9_-]{11}$/)
    expect(videoUrl({ id: 'bJl4VSoESpo', by: 'matthewismith', start: 567 })).toBe(
      'https://www.youtube.com/watch?v=bJl4VSoESpo&t=567s',
    )
    expect(videoUrl({ id: 'bJl4VSoESpo', by: 'matthewismith' })).toBe('https://www.youtube.com/watch?v=bJl4VSoESpo')
  })
})
