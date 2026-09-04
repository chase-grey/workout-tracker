import { describe, it, expect } from 'vitest'
import { fmtBytes, formatLastError, formatProbe } from './poseReport'
import type { AssetProbe, PoseProbe } from './pose'

const asset = (over: Partial<AssetProbe> = {}): AssetProbe => ({
  name: 'pose_landmarker_full.task',
  status: 200,
  bytes: 9398198,
  declared: 9398198,
  ok: true,
  ...over,
})

const probe = (over: Partial<PoseProbe> = {}): PoseProbe => ({
  assets: [asset()],
  cached: [],
  build: { ok: true },
  ...over,
})

describe('fmtBytes', () => {
  it('scales from bytes to megabytes', () => {
    expect(fmtBytes(512)).toBe('512 B')
    expect(fmtBytes(322044)).toBe('314 KB')
    expect(fmtBytes(11153617)).toBe('10.6 MB')
  })
})

describe('formatProbe', () => {
  it('reports a healthy file by name, status, and size', () => {
    expect(formatProbe(probe())[0]).toBe('pose_landmarker_full.task · 200 · 9.0 MB')
  })

  // The whole point of reading the body rather than trusting the status: a
  // download that arrived short answers 200 and is unusable.
  it('calls out a body shorter than the response promised', () => {
    const lines = formatProbe(probe({ assets: [asset({ bytes: 4194304 })] }))
    expect(lines[0]).toBe('pose_landmarker_full.task · 200 · short: 4.0 MB of 9.0 MB')
  })

  it('reports a missing file by its status', () => {
    const lines = formatProbe(probe({ assets: [asset({ status: 404, bytes: 9, ok: false })] }))
    expect(lines[0]).toBe('pose_landmarker_full.task · 404 · 9 B')
  })

  it('reports a fetch that never answered, with why', () => {
    const lines = formatProbe(
      probe({
        assets: [asset({ status: null, bytes: 0, declared: null, ok: false, note: 'Load failed' })],
      }),
    )
    expect(lines[0]).toBe('pose_landmarker_full.task · no response · Load failed')
  })

  it('names what the service worker is holding, or that it holds nothing', () => {
    expect(formatProbe(probe({ cached: ['a.wasm', 'b.task'] }))[1]).toBe('cached: a.wasm, b.task')
    expect(formatProbe(probe())[1]).toBe('cached: nothing')
  })

  it('ends on whether the detector built, and where it stopped if not', () => {
    expect(formatProbe(probe()).at(-1)).toBe('detector: built')
    expect(
      formatProbe(probe({ build: { ok: false, stage: 'model', message: 'Aborted(OOM)' } })).at(-1),
    ).toBe('detector: failed at model — Aborted(OOM)')
  })
})

describe('formatLastError', () => {
  it('says nothing when the last load worked', () => {
    expect(formatLastError(null)).toBeNull()
  })

  it('dates the failure and names the step', () => {
    expect(
      formatLastError({
        at: '2026-08-26T18:22:31.000Z',
        stage: 'runtime',
        message: 'Failed to fetch dynamically imported module',
        attempts: 1,
      }),
    ).toBe('2026-08-26 18:22 · failed at runtime — Failed to fetch dynamically imported module')
  })

  // A load that failed twice failed the retry too, which rules the cache out.
  it('marks a failure that survived the retry', () => {
    expect(
      formatLastError({ at: '2026-08-26T18:22:31.000Z', stage: 'model', message: 'x', attempts: 2 }),
    ).toBe('2026-08-26 18:22 · failed at model after 2 tries — x')
  })
})
