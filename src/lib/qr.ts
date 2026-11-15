// The QR encoder is pulled from a CDN the first time one is drawn rather than
// added as a dependency. An unreachable CDN just drops the QR; every place that
// shows one shows the link beside it.
const QR_CDN = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/+esm'

type QrFactory = (
  typeNumber: number,
  errorCorrection: string,
) => {
  addData: (data: string) => void
  make: () => void
  createSvgTag: (opts: { cellSize: number; margin: number; scalable: boolean }) => string
}

let qrPromise: Promise<QrFactory> | null = null
function loadQr(): Promise<QrFactory> {
  if (!qrPromise)
    qrPromise = import(/* @vite-ignore */ QR_CDN).then((mod) => mod.default as QrFactory)
  // A failed load isn't cached, so the next QR tries the CDN again.
  qrPromise.catch(() => {
    qrPromise = null
  })
  return qrPromise
}

/** `text` as a scalable SVG QR code. Rejects when the encoder can't be loaded. */
export async function qrSvg(text: string): Promise<string> {
  const qrcode = await loadQr()
  // Type 0 = smallest version that fits; 'M' error correction is the usual
  // trade-off for a screen-to-camera scan.
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  return qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true })
}
