import { describe, it, expect } from 'vitest'
import { fmtBytes, formatDetail, formatLastError, formatProbe, shortMessage } from './poseReport'
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

describe('shortMessage', () => {
  it('leaves a short plain message alone', () => {
    expect(shortMessage('Failed to fetch')).toBe('Failed to fetch')
  })

  // Emscripten's abort wraps the real reason in boilerplate about rebuilding
  // the wasm, which nobody holding a phone can act on.
  it('unwraps an Emscripten abort down to what was aborted on', () => {
    expect(
      shortMessage(
        'RuntimeError: Aborted(RangeError: WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance). Build with -sASSERTIONS for more info.',
      ),
    ).toBe(
      'RangeError: WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance',
    )
    expect(shortMessage('Aborted(OOM)')).toBe('OOM')
  })

  it('flattens a multi-line graph error onto one line', () => {
    expect(shortMessage('INVALID_ARGUMENT: Graph has errors:\n   Calculator::Open() failed')).toBe(
      'INVALID_ARGUMENT: Graph has errors: Calculator::Open() failed',
    )
  })

  it('cuts a long message with an ellipsis', () => {
    const long = 'x'.repeat(400)
    const short = shortMessage(long)
    expect(short.length).toBe(120)
    expect(short.endsWith('…')).toBe(true)
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
      assets: [
        asset({
          status: null,
          bytes: 0,
          declared: null,
          ok: false,
          note: 'Load failed',
        }),
      ],
    })
    expect(formatProbe(p)).toBe("pose_landmarker_full.task didn't download (Load failed)")
  })

  it('names the error, shortened, when the files are fine but the detector would not build', () => {
    expect(
      formatProbe(
        probe({
          build: { ok: false, stage: 'model', message: 'Aborted(OOM)' },
        }),
      ),
    ).toBe("didn't start: OOM")
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

  it('keeps the line short however long the error ran', () => {
    const line = formatLastError({
      at: '2026-08-26T18:22:31.000Z',
      stage: 'model',
      message: 'y'.repeat(900),
    })
    expect(line!.length).toBeLessThan(160)
  })
})

describe('formatDetail', () => {
  it('has nothing to copy when the check passed', () => {
    expect(formatDetail(probe(), null)).toBeNull()
    expect(formatDetail(null, null)).toBeNull()
  })

  it('gives the whole stored error, with its stage and time', () => {
    const long = 'z'.repeat(500)
    expect(
      formatDetail(null, {
        at: '2026-08-26T18:22:31.000Z',
        stage: 'model',
        message: long,
      }),
    ).toBe(`model 2026-08-26T18:22:31.000Z\n${long}`)
  })

  it('lists each file and the whole build error for a failed check', () => {
    const p = probe({
      assets: [
        asset(),
        asset({
          name: 'vision_wasm_internal.wasm',
          bytes: 1048576,
          declared: 11153617,
          ok: false,
        }),
      ],
      build: {
        ok: false,
        stage: 'model',
        message: 'Aborted(OOM). Build with -sASSERTIONS for more info.',
      },
    })
    expect(formatDetail(p, null)).toBe(
      [
        'pose_landmarker_full.task: 200, 9.0 MB',
        'vision_wasm_internal.wasm: 200, 1.0 MB of 10.6 MB',
        'build failed at model: Aborted(OOM). Build with -sASSERTIONS for more info.',
      ].join('\n'),
    )
  })
})
