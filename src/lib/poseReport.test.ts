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
  it('says working when every file came back and the detector built', () => {
    expect(formatProbe(probe())).toBe('working')
  })

  // The whole point of reading the body rather than trusting the status: a
  // download that arrived short answers 200 and is unusable.
  it('calls out a body shorter than the response promised', () => {
    expect(formatProbe(probe({ assets: [asset({ bytes: 4194304, ok: false })] }))).toBe(
      'pose_landmarker_full.task only partly downloaded (4.0 MB of 9.0 MB)',
    )
  })

  it('reports a missing file by its status', () => {
    expect(formatProbe(probe({ assets: [asset({ status: 404, bytes: 9, ok: false })] }))).toBe(
      "pose_landmarker_full.task didn't download (404)",
    )
  })

  it('reports a fetch that never answered, with why', () => {
    const p = probe({
      assets: [asset({ status: null, bytes: 0, declared: null, ok: false, note: 'Load failed' })],
    })
    expect(formatProbe(p)).toBe("pose_landmarker_full.task didn't download (Load failed)")
  })

  it('names the error when the files are fine but the detector would not build', () => {
    expect(
      formatProbe(probe({ build: { ok: false, stage: 'model', message: 'Aborted(OOM)' } })),
    ).toBe("didn't start: Aborted(OOM)")
  })
})

describe('formatLastError', () => {
  it('says nothing when the last load worked', () => {
    expect(formatLastError(null)).toBeNull()
  })

  it('dates the failure and gives the error', () => {
    const line = formatLastError({
      at: '2026-08-26T18:22:31.000Z',
      stage: 'runtime',
      message: 'Failed to fetch dynamically imported module',
    })
    expect(line).toMatch(/^didn't load .+: Failed to fetch dynamically imported module$/)
  })
})
