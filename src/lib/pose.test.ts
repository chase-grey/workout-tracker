import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Stand in for the lazily-imported MediaPipe module. `createMock` is what each
// test drives to decide whether building the detector succeeds or blows up.
const { createMock, forVisionTasksMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  forVisionTasksMock: vi.fn(),
}))
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: forVisionTasksMock },
  PoseLandmarker: { createFromOptions: createMock },
}))

/** A detector that reports one body, with however many landmarks are asked for. */
const landmarkerFor = (landmarks: { x: number; y: number }[] | null) => ({
  detect: () => ({ landmarks: landmarks ? [landmarks] : [] }),
})

const point = { x: 0.5, y: 0.5 }

/** The Cache Storage the service worker keeps the runtime and model in. */
let deleted: string[]

beforeEach(() => {
  deleted = []
  forVisionTasksMock.mockReset().mockResolvedValue({})
  createMock.mockReset()
  vi.resetModules()
  vi.stubGlobal('caches', {
    delete: (name: string) => {
      deleted.push(name)
      return Promise.resolve(true)
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Fresh copy of the module, so the memoized detector doesn't leak between tests. */
const loadPose = () => import('./pose')

// The canvas is never touched by the stubbed detector, so any object will do.
const frame = {} as CanvasImageSource

describe('detectPose', () => {
  it('reports the landmarks a healthy detector finds', async () => {
    createMock.mockResolvedValue(landmarkerFor([point]))
    const { detectPose } = await loadPose()

    expect(await detectPose(frame)).toEqual({ ok: true, landmarks: [point] })
    expect(deleted).toEqual([])
  })

  it('builds the detector once and reuses it across measurements', async () => {
    createMock.mockResolvedValue(landmarkerFor([point]))
    const { detectPose } = await loadPose()

    await detectPose(frame)
    await detectPose(frame)
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  // The fix: cache-first means a download cut short is served back forever, so a
  // failed build has to clear the cache and go to the network again.
  it('clears the cached runtime and retries when the first build fails', async () => {
    createMock
      .mockRejectedValueOnce(new Error('magic word mismatch'))
      .mockResolvedValueOnce(landmarkerFor([point]))
    const { detectPose } = await loadPose()

    expect(await detectPose(frame)).toEqual({ ok: true, landmarks: [point] })
    expect(deleted).toEqual(['pose-detector'])
  })

  // A phone that can't build the full model with good bytes in hand gets the
  // lite one rather than guessed dots.
  it('falls back to the lite model when the full one fails twice', async () => {
    createMock
      .mockRejectedValueOnce(new Error('Out of memory'))
      .mockRejectedValueOnce(new Error('Out of memory'))
      .mockResolvedValueOnce(landmarkerFor([point]))
    const { detectPose } = await loadPose()

    expect(await detectPose(frame)).toEqual({ ok: true, landmarks: [point] })
    const models = createMock.mock.calls.map(([, opts]) => opts.baseOptions.modelAssetPath)
    expect(models[2]).toMatch(/pose_landmarker_lite\.task$/)
  })

  // A load that recovered worked; Settings shouldn't go on saying it failed.
  it('leaves no stored failure when a retry recovers', async () => {
    createMock
      .mockRejectedValueOnce(new Error('Out of memory'))
      .mockRejectedValueOnce(new Error('Out of memory'))
      .mockResolvedValueOnce(landmarkerFor([point]))
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => stored.get(k) ?? null,
      setItem: (k: string, v: string) => stored.set(k, v),
      removeItem: (k: string) => stored.delete(k),
    })
    stored.set('poseLoadError', JSON.stringify({ at: 'x', stage: 'runtime', message: 'old' }))
    const { detectPose, lastPoseError } = await loadPose()

    await detectPose(frame)
    expect(lastPoseError()).toBeNull()
  })

  it('gives up with a model failure once the lite model fails too', async () => {
    createMock.mockRejectedValue(new Error('magic word mismatch'))
    const { detectPose } = await loadPose()

    const res = await detectPose(frame)
    expect(res).toMatchObject({ ok: false, reason: 'model' })
    expect(createMock).toHaveBeenCalledTimes(3)
  })

  it('tries again on the next measurement after a load that failed', async () => {
    createMock
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(landmarkerFor([point]))
    const { detectPose } = await loadPose()

    expect(await detectPose(frame)).toMatchObject({ ok: false, reason: 'model' })
    expect(await detectPose(frame)).toEqual({ ok: true, landmarks: [point] })
  })

  // The preload and the shutter can both ask before the first build is done.
  it('shares one load between overlapping callers', async () => {
    createMock.mockResolvedValue(landmarkerFor([point]))
    const { detectPose, preloadPose } = await loadPose()

    preloadPose()
    await Promise.all([detectPose(frame), detectPose(frame)])
    expect(createMock).toHaveBeenCalledTimes(1)
  })

  it('still retries where there is no Cache Storage to clear', async () => {
    vi.stubGlobal('caches', undefined)
    createMock
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(landmarkerFor([point]))
    const { detectPose } = await loadPose()

    expect(await detectPose(frame)).toEqual({ ok: true, landmarks: [point] })
  })

  it('separates an empty frame from a broken model, and leaves the cache alone', async () => {
    createMock.mockResolvedValue(landmarkerFor(null))
    const { detectPose } = await loadPose()

    expect(await detectPose(frame)).toEqual({ ok: false, reason: 'no-pose' })
    expect(deleted).toEqual([])
  })
})
