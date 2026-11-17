import { useEffect, useState } from 'react'

/**
 * "never ask" for progress photos. It changes every session after this one, so
 * the first tap only arms it and the same button turns into "sure? never ask";
 * the second tap commits. Left alone for a few seconds it disarms.
 */
export function NeverAskPhotos({ onConfirm, className = 'text-neutral-400' }: { onConfirm: () => void; className?: string }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = window.setTimeout(() => setArmed(false), 4000)
    return () => window.clearTimeout(t)
  }, [armed])
  return (
    <button
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      className={`min-h-[40px] px-2 text-sm ${armed ? 'font-semibold text-red-400' : className}`}
    >
      {armed ? 'sure? never ask' : 'never ask'}
    </button>
  )
}
