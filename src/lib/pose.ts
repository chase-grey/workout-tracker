import type { Pt } from './splitAngle'

/**
 * Lazy MediaPipe Pose landmark detector, loaded on first use so it stays out of
 * the main bundle and only downloads when a measurement is taken. Accepts any
 * canvas image source (image, canvas, or video frame).
 *
 * The runtime and model are served from our own origin (see mediapipeAssets in
 * vite.config.ts) rather than public CDNs: a phone that can't reach a CDN can
 * still measure, and the service worker caches both after the first download,
 * so measuring keeps working offline.
 */

const WASM_URL = `${import.meta.env.BASE_URL}mediapipe`
// "full" rather than "lite": we run this on one still photo, so landmark
// accuracy is worth far more than inference speed.
const MODEL_URL = `${import.meta.env.BASE_URL}mediapipe/pose_landmarker_full.task`

/** A landmark plus MediaPipe's confidence that the point is really in frame. */
export type Landmark = Pt & { visibility?: number }

/**
 * Why detection produced nothing: 'model' means the wasm/model download or
 * setup failed (offline, blocked CDN), 'no-pose' means it ran but found no
 * body in the frame. The distinction is what the editor tells the user.
 */
export type PoseFailure = 'model' | 'no-pose'

export type PoseResult =
  | { ok: true; landmarks: Landmark[] }
  | { ok: false; reason: PoseFailure; detail?: string }

/**
 * Which step of the load fell over. Worth separating because the three fail for
 * unrelated reasons and only one of them is about the big downloads: 'runtime'
 * is our own lazy chunk, 'fileset' is MediaPipe choosing a wasm variant, and
 * 'model' is the twenty megabytes of wasm and weights actually landing and
 * instantiating.
 */
export type PoseStage = 'runtime' | 'fileset' | 'model'

/** What the last failed load was, kept for the check in Settings. */
export type PoseLoadError = { at: string; stage: PoseStage; message: string; attempts: number }

// Minimal shapes we need from the lazily-imported module (avoids coupling the
// build to its full type surface).
type Landmarker = { detect: (img: CanvasImageSource) => { landmarks?: Landmark[][] } }
/** MediaPipe's answer to "which wasm files should I load", so we can probe them. */
type Fileset = { wasmLoaderPath?: string; wasmBinaryPath?: string }
type VisionModule = {
  FilesetResolver: { forVisionTasks: (wasmUrl: string) => Promise<Fileset> }
  PoseLandmarker: { createFromOptions: (fileset: Fileset, opts: unknown) => Promise<Landmarker> }
}

let cached: Landmarker | null = null

/** Matches the runtimeCaching cacheName in vite.config.ts. */
const ASSET_CACHE = 'pose-detector'

/** Where the last failure is parked for Settings to read after the fact. */
const ERROR_KEY = 'poseLoadError'

/** An error that remembers which step of the load raised it. */
class StageError extends Error {
  stage: PoseStage

  constructor(stage: PoseStage, cause: unknown) {
    super(cause instanceof Error ? cause.message || cause.name : String(cause))
    this.stage = stage
  }
}

const stageOf = (err: unknown): PoseStage => (err instanceof StageError ? err.stage : 'model')
const messageOf = (err: unknown): string =>
  err instanceof Error ? err.message || err.name : String(err)

async function step<T>(stage: PoseStage, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    throw new StageError(stage, err)
  }
}

async function build(): Promise<Landmarker> {
  const vision = await step(
    'runtime',
    async () => (await import('@mediapipe/tasks-vision')) as unknown as VisionModule,
  )
  const fileset = await step('fileset', () => vision.FilesetResolver.forVisionTasks(WASM_URL))
  return step('model', () =>
    vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL },
      runningMode: 'IMAGE',
      numPoses: 1,
    }),
  )
}

/**
 * Remember why a load failed, because the phone has no console and the angle
 * editor only ever said "couldn't load the pose model" — true, unhelpful, and
 * the reason this failure survived two rounds of being guessed at.
 */
function recordError(err: unknown, attempts: number): void {
  try {
    const entry: PoseLoadError = {
      at: new Date().toISOString(),
      stage: stageOf(err),
      message: messageOf(err),
      attempts,
    }
    localStorage.setItem(ERROR_KEY, JSON.stringify(entry))
  } catch {
    // No storage to write to; the check in Settings just has nothing to show.
  }
}

/** The last failed load, or null if the last one worked (or none has run). */
export function lastPoseError(): PoseLoadError | null {
  try {
    const raw = localStorage.getItem(ERROR_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PoseLoadError
    return parsed.stage && parsed.message ? parsed : null
  } catch {
    return null
  }
}

function clearError(): void {
  try {
    localStorage.removeItem(ERROR_KEY)
  } catch {
    // Nothing stored, nothing to clear.
  }
}

/**
 * Build the detector, and give a bad cached copy one chance to heal.
 *
 * The service worker holds the runtime and model cache-first, which is what
 * lets measuring work offline — but it also makes the first download the only
 * one. Dropping the cache before a second attempt turns a bad stored copy back
 * into a plain retry over the network, at the cost of one repeat download. A
 * first attempt that failed is recorded either way, so a load that only works
 * on the retry still says so in Settings.
 */
async function getLandmarker(): Promise<Landmarker> {
  if (cached) return cached
  try {
    cached = await build()
  } catch (first) {
    try {
      await caches.delete(ASSET_CACHE)
    } catch {
      // No Cache Storage to clear; the retry just repeats over the network.
    }
    try {
      cached = await build()
    } catch (second) {
      recordError(second, 2)
      throw second
    }
    recordError(first, 1)
    return cached
  }
  clearError()
  return cached
}

/**
 * Detect the first person's pose landmarks. Never throws: a failed model load
 * and an empty frame come back as distinct failure reasons so the caller can
 * say which one happened instead of silently showing guessed handles.
 */
export async function detectPose(source: CanvasImageSource): Promise<PoseResult> {
  let landmarker: Landmarker
  try {
    landmarker = await getLandmarker()
  } catch (err) {
    return { ok: false, reason: 'model', detail: `${stageOf(err)}: ${messageOf(err)}` }
  }
  try {
    const landmarks = landmarker.detect(source).landmarks?.[0]
    if (!landmarks?.length) return { ok: false, reason: 'no-pose' }
    return { ok: true, landmarks }
  } catch (err) {
    return { ok: false, reason: 'no-pose', detail: String(err) }
  }
}

/** One file the loader asks for, as it actually came back on this device. */
export type AssetProbe = {
  name: string
  status: number | null
  /** Bytes we could actually read — short of `declared` means a partial body. */
  bytes: number
  /** What the response said it was sending, when it said. */
  declared: number | null
  ok: boolean
  note?: string
}

export type PoseProbe = {
  assets: AssetProbe[]
  /** Filenames the service worker is holding for the detector. */
  cached: string[]
  build: { ok: boolean; stage?: PoseStage; message?: string }
}

async function probeAsset(url: string): Promise<AssetProbe> {
  const name = url.split('/').pop() || url
  try {
    const res = await fetch(url)
    const header = Number(res.headers.get('content-length'))
    const declared = Number.isFinite(header) && header > 0 ? header : null
    const bytes = (await res.arrayBuffer()).byteLength
    return {
      name,
      status: res.status,
      bytes,
      declared,
      ok: res.ok && bytes > 0 && (declared === null || declared === bytes),
    }
  } catch (err) {
    return { name, status: null, bytes: 0, declared: null, ok: false, note: messageOf(err) }
  }
}

async function cachedFiles(): Promise<string[]> {
  try {
    const keys = await (await caches.open(ASSET_CACHE)).keys()
    return keys.map((r) => r.url.split('/').pop() ?? r.url)
  } catch {
    return []
  }
}

/**
 * Fetch every file a measurement needs, then try to build the detector for
 * real, reporting what each step did.
 *
 * This exists because the failure only happens on the phone, where there is no
 * console to read and no way to tell a 404 from a download that arrived short
 * from a runtime that won't instantiate. The asset fetches go through the same
 * service worker path a measurement uses, so what they report is what the
 * detector is really being handed, a cached copy included.
 */
export async function probePose(): Promise<PoseProbe> {
  const assets: AssetProbe[] = []
  let urls = [MODEL_URL]
  try {
    const vision = (await import('@mediapipe/tasks-vision')) as unknown as VisionModule
    const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL)
    urls = [fileset.wasmLoaderPath, fileset.wasmBinaryPath, MODEL_URL].filter(
      (u): u is string => !!u,
    )
  } catch {
    // Can't ask which wasm variant this browser gets; the model is still worth
    // probing, and the build attempt below names whatever went wrong.
  }
  for (const url of urls) assets.push(await probeAsset(url))

  const held = await cachedFiles()
  try {
    cached = await build()
    clearError()
    return { assets, cached: held, build: { ok: true } }
  } catch (err) {
    recordError(err, 1)
    return {
      assets,
      cached: held,
      build: { ok: false, stage: stageOf(err), message: messageOf(err) },
    }
  }
}

/** Drop the cached runtime and model so the next measurement downloads again. */
export async function clearPoseCache(): Promise<void> {
  cached = null
  clearError()
  try {
    await caches.delete(ASSET_CACHE)
  } catch {
    // Nothing cached to drop.
  }
}
