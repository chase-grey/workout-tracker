import { detectPose, type Landmark, type PoseFailure } from './pose'
import { handlesFromLandmarks, type Handles, type MeasureMode } from './measure'

type Result = { ok: true; handles: Handles } | { ok: false; reason: PoseFailure | 'partial' }

/** A window onto the photo, in the photo's own 0..1 coordinates. */
export type Crop = { x: number; y: number; w: number; h: number }

/**
 * One way of showing the photo to the detector: turned by quarter turns (a fold
 * reads as a body once it's upright), or cut down to a window of it.
 */
type View = { turns: number; crop: Crop | null }

const WHOLE: View = { turns: 0, crop: null }

/**
 * The windows tried when the whole photo holds no body the detector will own
 * up to: the middle of the frame, then each corner, each two thirds of the
 * photo a side. The detector shrinks whatever it's handed to a small square, so
 * someone standing well back from a propped phone is a few dozen pixels tall by
 * the time it looks — and half as big again through one of these.
 */
export const ZOOM_CROPS: Crop[] = [1 / 6, 0, 1 / 3].flatMap((y) =>
  (y === 1 / 6 ? [1 / 6] : [0, 1 / 3]).map((x) => ({ x, y, w: 2 / 3, h: 2 / 3 })),
)

/** Every view a mode is tried in, the plain photo first. */
function viewsFor(mode: MeasureMode): View[] {
  // A forward fold is the one pose the detector misses for being upside down
  // rather than small, so it's turned before it's zoomed.
  const turned = mode === 'toe_touch' ? [1, 3, 2].map((turns) => ({ turns, crop: null })) : []
  return [WHOLE, ...turned, ...ZOOM_CROPS.map((crop) => ({ turns: 0, crop }))]
}

/** A landmark found in a view, put back where it sits on the whole photo. */
export function toPhoto(p: Landmark, view: View): Landmark {
  if (view.crop) return { ...p, x: view.crop.x + p.x * view.crop.w, y: view.crop.y + p.y * view.crop.h }
  if (view.turns === 1) return { ...p, x: p.y, y: 1 - p.x }
  if (view.turns === 3) return { ...p, x: 1 - p.y, y: p.x }
  if (view.turns === 2) return { ...p, x: 1 - p.x, y: 1 - p.y }
  return p
}

/** Draw a view of the photo to a canvas of its own, or null where there's no 2D context. */
function render(source: HTMLCanvasElement, view: View): HTMLCanvasElement | null {
  const frame = document.createElement('canvas')
  const ctx = frame.getContext('2d')
  if (!ctx) return null
  if (view.crop) {
    const { x, y, w, h } = view.crop
    frame.width = Math.max(1, Math.round(source.width * w))
    frame.height = Math.max(1, Math.round(source.height * h))
    ctx.drawImage(
      source,
      Math.round(source.width * x),
      Math.round(source.height * y),
      frame.width,
      frame.height,
      0,
      0,
      frame.width,
      frame.height,
    )
    return frame
  }
  // Bound temporary image memory for large camera-roll photos.
  const scale = Math.min(1, 1600 / Math.max(source.width, source.height))
  const width = Math.max(1, Math.round(source.width * scale))
  const height = Math.max(1, Math.round(source.height * scale))
  frame.width = view.turns % 2 ? height : width
  frame.height = view.turns % 2 ? width : height
  ctx.translate(frame.width / 2, frame.height / 2)
  ctx.rotate(view.turns * Math.PI / 2)
  ctx.drawImage(source, -width / 2, -height / 2, width, height)
  return frame
}

/**
 * Find the pose's handles on a photo, looking again — turned, then zoomed — when
 * the first look comes back empty or without the joints the pose is read from.
 * The dots always come back in the original photo's coordinates.
 *
 * A usable first look costs one inference, as before; the others are only paid
 * for by a photo that would otherwise have opened on guessed dots.
 */
export async function detectMeasurementPose(
  source: HTMLCanvasElement,
  mode: MeasureMode,
  mirrored = false,
): Promise<Result> {
  let reason: PoseFailure | 'partial' = 'no-pose'
  for (const view of viewsFor(mode)) {
    const frame = view === WHOLE ? source : render(source, view)
    if (!frame) break
    const result = await detectPose(frame)
    if (!result.ok) {
      if (result.reason === 'model') return result
      continue
    }
    reason = 'partial'
    const handles = handlesFromLandmarks(
      mode,
      result.landmarks.map((p) => toPhoto(p, view)),
      mirrored,
    )
    if (handles) return { ok: true, handles }
  }
  return { ok: false, reason }
}
