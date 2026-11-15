import { useEffect, useState } from 'react'
import { fetchShareUrl } from '../../lib/share'
import { qrSvg } from '../../lib/qr'

/**
 * "Open this on your phone" — this machine's LAN address plus a QR to scan.
 *
 * Scanning it is what brings the chat coach to the phone: the phone loads this
 * dev server directly, so its /api/chat proxy (and the Epic key behind it) is
 * simply there. Both devices have to be on Epic private wifi for that hop to
 * exist at all — see lib/share. Renders nothing until the dev server reports an
 * address, so it's invisible in the deployed build.
 */

export function PhoneLink() {
  const [url, setUrl] = useState<string | null>(null)
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let alive = true
    void fetchShareUrl().then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!url) return
    let alive = true
    qrSvg(url)
      .then((svg) => alive && setSvg(svg))
      .catch(() => {
        /* no QR; the link is still there */
      })
    return () => {
      alive = false
    }
  }, [url])

  // Already viewing over the LAN (i.e. this IS the phone) — nothing to offer.
  if (!url || new URL(url).host === window.location.host) return null

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
            href={url}
            target="_blank"
            rel="noreferrer"
            className="block break-all font-mono text-xs text-accent-2"
          >
            {url.replace(/^https?:\/\//, '')}
          </a>
        </div>
      </div>
    </section>
  )
}
