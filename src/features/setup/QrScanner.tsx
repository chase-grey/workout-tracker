import { useEffect, useRef, useState } from 'react'
import { frameReader } from '../../lib/qrScan'
import { credentialFromScan, type SignInCredential } from '../../lib/signInLink'

/**
 * The camera, full screen, until a sign-in QR comes into view. Any other code
 * is ignored and the scan carries on: the one on the other phone's Settings is
 * the only one this is looking for.
 */
export function QrScanner({
  onCredential,
  onClose,
}: {
  onCredential: (cred: SignInCredential) => void
  onClose: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [failed, setFailed] = useState(false)
  // Held in a ref so a parent re-render doesn't restart the camera.
  const found = useRef(onCredential)
  found.current = onCredential

  useEffect(() => {
    let alive = true
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        })
        if (!alive) return
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        const read = await frameReader()
        const tick = async () => {
          if (!alive) return
          const text = await read(video).catch(() => null)
          const cred = text ? credentialFromScan(text) : undefined
          if (cred) {
            alive = false
            found.current(cred)
            return
          }
          timer = setTimeout(() => void tick(), 150)
        }
        void tick()
      } catch {
        if (alive) setFailed(true)
      }
    }
    void start()

    return () => {
      alive = false
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <video ref={videoRef} playsInline muted className="min-h-0 flex-1 object-cover" />
      {!failed && (
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-4 border-white/80"
        />
      )}
      {failed && (
        <p role="alert" className="absolute inset-x-0 top-1/3 px-6 text-center text-base text-neutral-200">
          camera unavailable
        </p>
      )}
      <div className="bg-black px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={onClose}
          className="min-h-[48px] w-full rounded-xl bg-surface font-semibold text-neutral-100"
        >
          cancel
        </button>
      </div>
    </div>
  )
}
