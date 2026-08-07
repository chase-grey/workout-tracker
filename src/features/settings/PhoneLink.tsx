import { useEffect, useState } from 'react'
import { fetchShareUrl } from '../../lib/share'

/**
 * "Open this on your phone" — the Cloudflare quick tunnel URL plus a QR to scan.
 *
 * Scanning this from the desktop before heading to the gym is what brings the
 * chat coach to the phone: the phone loads the dev server through the tunnel, so
 * its /api/chat proxy (and the Epic key behind it) travels with you. Renders
 * nothing until a tunnel is detected, so it's invisible on a plain `npm run dev`.
 */

// The QR encoder is pulled from a CDN the first time this renders rather than
// added as a dependency — it's a dev-only affordance. Unreachable CDN just drops
// the QR; the link still carries the section.
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
  return qrPromise
}

export function PhoneLink() {
  const [link, setLink] = useState<{ url: string; verified: boolean } | null>(null)
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let alive = true
    void fetchShareUrl().then((l) => alive && setLink(l))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!link) return
    let alive = true
    loadQr()
      .then((qrcode) => {
        // Type 0 = smallest version that fits; 'M' error correction is the usual
        // trade-off for a screen-to-camera scan.
        const qr = qrcode(0, 'M')
        qr.addData(link.url)
        qr.make()
        if (alive) setSvg(qr.createSvgTag({ cellSize: 4, margin: 1, scalable: true }))
      })
      .catch(() => {
        /* no QR; the link is still there */
      })
    return () => {
      alive = false
    }
  }, [link])

  // Already viewing through the tunnel (i.e. this IS the phone) — nothing to offer.
  if (!link || new URL(link.url).host === window.location.host) return null

  return (
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-300">open on your phone</label>
      <div className="flex items-center gap-3 rounded-xl bg-surface p-3">
        {svg && (
          <div
            className="h-24 w-24 shrink-0 rounded-lg bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
        <div className="min-w-0 flex-1">
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="block break-all font-mono text-xs text-accent-2"
          >
            {link.url.replace(/^https?:\/\//, '')}
          </a>
          {!link.verified && (
            <p className="mt-1 text-xs text-neutral-500">tunnel found but not confirmed</p>
          )}
        </div>
      </div>
    </section>
  )
}
