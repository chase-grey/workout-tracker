import { useEffect, useState } from 'react'
import { bottomEdge, type BottomEdge, type BottomFacts } from './screenBottom'

/**
 * `env(safe-area-inset-bottom)` in px. CSS is the only place it can be read, so
 * a hidden element wears it as padding and is measured.
 */
function safeBottom(): number {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding-bottom:env(safe-area-inset-bottom,0px)'
  document.body.appendChild(probe)
  const px = parseFloat(getComputedStyle(probe).paddingBottom) || 0
  probe.remove()
  return px
}

/** What `lib/screenBottom` decides from, read off this device as it stands. */
export function readBottomFacts(): BottomFacts {
  return {
    userAgent: navigator.userAgent,
    screen: { w: window.screen.width, h: window.screen.height },
    dpr: window.devicePixelRatio,
    inner: { w: window.innerWidth, h: window.innerHeight },
    safeBottom: safeBottom(),
  }
}

/**
 * The bottom edge an animation should run along on this device (see
 * lib/screenBottom), kept current through a rotation or a bar coming and going.
 */
export function useBottomEdge(): BottomEdge {
  const [edge, setEdge] = useState(() => bottomEdge(readBottomFacts()))
  useEffect(() => {
    const read = () => {
      const next = bottomEdge(readBottomFacts())
      setEdge((prev) => (prev.radius === next.radius && prev.lift === next.lift ? prev : next))
    }
    window.addEventListener('resize', read)
    return () => window.removeEventListener('resize', read)
  }, [])
  return edge
}
