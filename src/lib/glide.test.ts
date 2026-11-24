import { describe, expect, it } from 'vitest'
import { createGlide } from './glide'

/** A countdown of `total` ms, sampled at the given instants, read every frame. */
function run(total: number, sampleTimes: number[], until: number, frameMs = 1000 / 60) {
  const glide = createGlide()
  const truth = (t: number) => Math.max(0, 1 - t / total)
  const queue = [...sampleTimes]
  const frames: { t: number; value: number }[] = []
  for (let t = 0; t <= until; t += frameMs) {
    while (queue.length && queue[0] <= t) {
      const at = queue.shift()!
      glide.push(truth(at), at)
    }
    frames.push({ t, value: glide.read(t) })
  }
  return { frames, truth }
}

/** Per-frame steps once the run has settled, as multiples of the true step. */
function steps(frames: { t: number; value: number }[], total: number, from: number) {
  const out: number[] = []
  for (let i = 1; i < frames.length; i++) {
    if (frames[i - 1].t < from) continue
    const dt = frames[i].t - frames[i - 1].t
    out.push((frames[i - 1].value - frames[i].value) / (dt / total))
  }
  return out
}

/** Ticks every 250ms, each one late by a different amount, as a phone's are. */
function raggedTicks(until: number): number[] {
  const out = [0]
  let seed = 7
  for (let t = 250; t <= until; t += 250) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    out.push(t + (seed / 2147483648) * 90)
  }
  return out
}

describe('createGlide', () => {
  it('reads the first sample back untouched', () => {
    const glide = createGlide()
    glide.push(0.8, 1000)
    expect(glide.read(1000)).toBe(0.8)
  })

  it('moves at one steady speed between evenly spaced samples', () => {
    const total = 60_000
    const ticks = Array.from({ length: 41 }, (_, i) => i * 250)
    const { frames } = run(total, ticks, 10_000)
    for (const step of steps(frames, total, 2000)) expect(step).toBeCloseTo(1, 3)
  })

  it('holds that speed when every tick lands late by a different amount', () => {
    // The whole point: a CSS transition restarted on each of these would run
    // anywhere from a third slow to a third fast, tick by tick.
    const total = 60_000
    const { frames } = run(total, raggedTicks(10_000), 10_000)
    for (const step of steps(frames, total, 3000)) {
      expect(step).toBeGreaterThan(0.97)
      expect(step).toBeLessThan(1.03)
    }
  })

  it('is not shoved about by samples that arrive late', () => {
    // What the phone actually does: the countdown takes its reading on time, and
    // the shape hears about it anywhere from 2 to 70ms afterwards.
    const total = 60_000
    const glide = createGlide()
    let seed = 11
    const lag = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return 2 + (seed / 2147483648) * 68
    }
    const pending: { value: number; at: number }[] = []
    for (let t = 0; t <= 12_000; t += 250) pending.push({ value: 1 - t / total, at: t + lag() })
    const frames: { t: number; value: number }[] = []
    for (let t = 0; t <= 12_000; t += 1000 / 60) {
      while (pending.length && pending[0].at <= t) {
        const s = pending.shift()!
        glide.push(s.value, s.at)
      }
      frames.push({ t, value: glide.read(t) })
    }
    for (const step of steps(frames, total, 4000)) {
      expect(step).toBeGreaterThan(0.85)
      expect(step).toBeLessThan(1.15)
    }
  })

  it('stays within a frame or two of the true reading', () => {
    const total = 60_000
    const { frames, truth } = run(total, raggedTicks(10_000), 10_000)
    for (const { t, value } of frames.filter((f) => f.t > 3000)) {
      // Trails by the ease's time constant, 80ms of a 60s rest, and no more.
      expect(Math.abs(value - truth(t))).toBeLessThan(200 / total)
    }
  })

  it('never runs backwards on a countdown', () => {
    const { frames } = run(45_000, raggedTicks(8000), 8000)
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].value).toBeLessThanOrEqual(frames[i - 1].value + 1e-12)
    }
  })

  it('stops when the samples stop', () => {
    const glide = createGlide()
    for (let t = 0; t <= 2000; t += 250) glide.push(1 - t / 60_000, t)
    for (let t = 2000; t <= 4000; t += 16) glide.read(t)
    const held = glide.read(4000)
    expect(glide.read(9000)).toBe(held)
    // And it stopped close to the last thing it was told, not seconds past it.
    expect(Math.abs(held - (1 - 2000 / 60_000))).toBeLessThan(500 / 60_000)
  })

  it('picks the pace back up after a stop without a lurch', () => {
    const glide = createGlide()
    for (let t = 0; t <= 2000; t += 250) glide.push(1 - t / 60_000, t)
    let value = 1
    for (let t = 0; t < 7000; t += 16) value = glide.read(t)
    // Five seconds stopped, then the same countdown carries on from where it was.
    const resumed = (t: number) => 1 - (t - 5000) / 60_000
    let worst = 0
    for (let t = 7000; t <= 10_000; t += 16) {
      if ((t - 7000) % 250 < 16) glide.push(resumed(t), t)
      const next = glide.read(t)
      worst = Math.max(worst, Math.abs(next - value))
      value = next
    }
    // No frame moves more than a few frames' worth of travel.
    expect(worst).toBeLessThan((16 * 6) / 60_000)
  })

  it('eases to a reading that jumps, rather than snapping or ignoring it', () => {
    const glide = createGlide()
    for (let t = 0; t <= 2000; t += 250) glide.push(0.5 - t / 60_000, t)
    for (let t = 0; t <= 2250; t += 16) glide.read(t)
    // The rest is extended: the reading leaps back up.
    glide.push(0.9, 2250)
    const justAfter = glide.read(2266)
    expect(justAfter).toBeGreaterThan(0.47)
    expect(justAfter).toBeLessThan(0.7)
    let value = justAfter
    for (let t = 2282; t <= 3000; t += 16) value = glide.read(t)
    // Where it was sent, less the moment it coasts on with no sample after it.
    expect(value).toBeCloseTo(0.9 - 400 / 60_000, 4)
  })

  it('lands on zero and stays there', () => {
    const total = 3000
    const ticks = Array.from({ length: 25 }, (_, i) => i * 250)
    const { frames } = run(total, ticks, 6000)
    expect(frames[frames.length - 1].value).toBe(0)
    for (const { value } of frames) expect(value).toBeGreaterThanOrEqual(0)
  })
})
