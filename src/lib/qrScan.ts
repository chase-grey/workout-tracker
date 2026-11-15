// Reading a QR off the camera. Chrome on Android has a native BarcodeDetector;
// Safari doesn't, so there the decoder is pulled from a CDN the first time it's
// needed, the way lib/qr pulls its encoder.
const JSQR_CDN = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm'

type JsQr = (data: Uint8ClampedArray, width: number, height: number) => { data: string } | null
type Detector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> }
type DetectorCtor = {
  new (opts: { formats: string[] }): Detector
  getSupportedFormats?: () => Promise<string[]>
}

/** Reads one frame of `video`: the QR's text, or null when there isn't one in view. */
export type FrameReader = (video: HTMLVideoElement) => Promise<string | null>

async function nativeReader(): Promise<FrameReader | null> {
  const Ctor = (globalThis as { BarcodeDetector?: DetectorCtor }).BarcodeDetector
  if (!Ctor) return null
  try {
    const formats = (await Ctor.getSupportedFormats?.()) ?? ['qr_code']
    if (!formats.includes('qr_code')) return null
    const detector = new Ctor({ formats: ['qr_code'] })
    return async (video) => (await detector.detect(video))[0]?.rawValue ?? null
  } catch {
    return null
  }
}

async function jsQrReader(): Promise<FrameReader> {
  const jsQR = (await import(/* @vite-ignore */ JSQR_CDN)).default as JsQr
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('no canvas')
  return async (video) => {
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return null
    // A smaller frame decodes faster and a phone camera's QR is still sharp at it.
    const scale = Math.min(1, 640 / Math.max(w, h))
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return jsQR(img.data, img.width, img.height)?.data ?? null
  }
}

/** The best frame reader this browser has. Rejects when there's none to be had. */
export async function frameReader(): Promise<FrameReader> {
  return (await nativeReader()) ?? jsQrReader()
}
