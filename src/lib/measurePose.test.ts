import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectPose, type Landmark } from './pose'
import { ZOOM_CROPS, detectMeasurementPose } from './measurePose'
import { anglesFromHandles } from './measure'
import { POSE } from './splitAngle'

vi.mock('./pose', () => ({ detectPose: vi.fn() }))
const detect = vi.mocked(detectPose)
const source = { width: 1200, height: 800 } as HTMLCanvasElement
const body = (): Landmark[] => {
  const points = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0.1 }))
  points[POSE.LEFT_SHOULDER] = { x: 0.2, y: 0.6, visibility: 0.9 }
  points[POSE.LEFT_HIP] = { x: 0.5, y: 0.4, visibility: 0.9 }
  points[POSE.LEFT_ANKLE] = { x: 0.5, y: 0.9, visibility: 0.9 }
  return points
}
const mockCanvas = () => {
  const ctx = { translate: vi.fn(), rotate: vi.fn(), drawImage: vi.fn() }
  const createElement = vi.fn(() => ({ width: 0, height: 0, getContext: () => ctx }))
  vi.stubGlobal('document', { createElement })
  return { ctx, createElement }
}
afterEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals() })

describe('measurement pose recovery', () => {
  it('uses a usable original result without creating retry images', async () => {
    detect.mockResolvedValue({ ok: true, landmarks: body() })
    const result = await detectMeasurementPose(source, 'toe_touch')
    expect(result.ok).toBe(true)
    expect(detect).toHaveBeenCalledTimes(1)
  })

  it.each([1, 3, 2])('maps a %s-quarter-turn retry back to the original landscape photo', async (turns) => {
    const { ctx } = mockCanvas()
    const order = [1, 3, 2]
    for (let i = 0; i <= order.indexOf(turns); i++) {
      detect.mockResolvedValueOnce({ ok: false, reason: 'no-pose' })
    }
    const rotated = body().map((p) => ({ ...p,
      ...(turns === 1 ? { x: 1 - p.y, y: p.x }
        : turns === 3 ? { x: p.y, y: 1 - p.x }
          : { x: 1 - p.x, y: 1 - p.y }),
    }))
    detect.mockResolvedValueOnce({ ok: true, landmarks: rotated })
    const result = await detectMeasurementPose(source, 'toe_touch')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected recovered pose')
    expect(result.handles.shoulder.x).toBeCloseTo(0.2)
    expect(result.handles.shoulder.y).toBeCloseTo(0.6)
    expect(result.handles.hip.x).toBeCloseTo(0.5)
    expect(result.handles.hip.y).toBeCloseTo(0.4)
    expect(anglesFromHandles('toe_touch', result.handles, 1.5).toeTouchDeg).toBeCloseTo(66, 0)
    expect(ctx.rotate).toHaveBeenLastCalledWith(turns * Math.PI / 2)
    const lastFrame = detect.mock.calls.at(-1)![0] as HTMLCanvasElement
    expect([lastFrame.width, lastFrame.height]).toEqual(turns % 2 ? [800, 1200] : [1200, 800])
  })

  it('retries a detected body whose measurement joints are hidden', async () => {
    mockCanvas()
    detect.mockResolvedValueOnce({ ok: true, landmarks: [] })
    detect.mockResolvedValue({ ok: false, reason: 'no-pose' })
    expect(await detectMeasurementPose(source, 'toe_touch')).toEqual({ ok: false, reason: 'partial' })
    expect(detect).toHaveBeenCalledTimes(4 + ZOOM_CROPS.length)
  })

  it('stops once every view has missed, without inventing landmarks', async () => {
    mockCanvas()
    detect.mockResolvedValue({ ok: false, reason: 'no-pose' })
    expect(await detectMeasurementPose(source, 'toe_touch')).toEqual({ ok: false, reason: 'no-pose' })
    expect(detect).toHaveBeenCalledTimes(4 + ZOOM_CROPS.length)
  })

  it('does not retry model load failures', async () => {
    detect.mockResolvedValue({ ok: false, reason: 'model' })
    expect(await detectMeasurementPose(source, 'toe_touch')).toEqual({ ok: false, reason: 'model' })
    expect(detect).toHaveBeenCalledTimes(1)
  })

  it('never turns the other poses, only zooms in on them', async () => {
    const { ctx } = mockCanvas()
    detect.mockResolvedValue({ ok: false, reason: 'no-pose' })
    await detectMeasurementPose(source, 'split')
    expect(detect).toHaveBeenCalledTimes(1 + ZOOM_CROPS.length)
    expect(ctx.rotate).not.toHaveBeenCalled()
  })

  it('zooms on the middle of the photo, then its corners, each inside the frame', () => {
    expect(ZOOM_CROPS).toHaveLength(5)
    expect(ZOOM_CROPS[0].x).toBeCloseTo(1 / 6)
    expect(ZOOM_CROPS[0].y).toBeCloseTo(1 / 6)
    for (const c of ZOOM_CROPS) {
      expect(c.x).toBeGreaterThanOrEqual(0)
      expect(c.y).toBeGreaterThanOrEqual(0)
      expect(c.x + c.w).toBeLessThanOrEqual(1 + 1e-9)
      expect(c.y + c.h).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('finds someone standing small in the frame through a crop, and puts the dots back on the whole photo', async () => {
    const { ctx } = mockCanvas()
    // Side-on, facing left, in the bottom right two thirds of the photo.
    const lms: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0.1 }))
    lms[POSE.LEFT_SHOULDER] = { x: 0.6, y: 0.3, visibility: 0.9 }
    lms[POSE.LEFT_HIP] = { x: 0.6, y: 0.6, visibility: 0.9 }
    lms[POSE.LEFT_KNEE] = { x: 0.57, y: 0.8, visibility: 0.9 }
    for (let i = 0; i < ZOOM_CROPS.length; i++) detect.mockResolvedValueOnce({ ok: false, reason: 'no-pose' })
    detect.mockResolvedValueOnce({ ok: true, landmarks: lms })
    const result = await detectMeasurementPose(source, 'pelvic_tilt')
    if (!result.ok) throw new Error('expected a body in the last crop')
    // The hip sits at 1/3 + 0.6 × 2/3 of the photo both ways; the dots straddle it.
    const { back, front } = result.handles
    expect((back.x + front.x) / 2).toBeCloseTo(1 / 3 + 0.6 * (2 / 3))
    expect(front.x).toBeLessThan(back.x)
    expect(front.y).toBeLessThan(1 / 3 + 0.6 * (2 / 3))
    // Cut from the source at the crop's own pixels: 1200×800 → an 800×533 window.
    expect(ctx.drawImage).toHaveBeenLastCalledWith(source, 400, 267, 800, 533, 0, 0, 800, 533)
  })
})
