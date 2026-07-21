import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import type { Celebration } from '../lib/celebration'
import { CelebrationOverlay } from '../components/CelebrationOverlay'

type CelebrationContextValue = {
  /** Enqueue a celebration to play. No-op for null (convenient for optional wins). */
  celebrate: (c: Celebration | null) => void
}

type Queued = { id: number; celebration: Celebration }

const Ctx = createContext<CelebrationContextValue | null>(null)

/**
 * Owns the celebration queue and renders one overlay at a time. Lives above the
 * data layer so a celebration keeps playing even as the app switches views
 * (e.g. finishing a workout drops you back to the Today tab mid-animation).
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<Queued[]>([])
  const nextId = useRef(0)

  const celebrate = useCallback((c: Celebration | null) => {
    if (c) setQueue((q) => [...q, { id: nextId.current++, celebration: c }])
  }, [])

  const current = queue[0] ?? null

  return (
    <Ctx.Provider value={{ celebrate }}>
      {children}
      {current && (
        <CelebrationOverlay
          // Stable per-item key: enqueuing another won't restart the one playing.
          key={current.id}
          celebration={current.celebration}
          onDone={() => setQueue((q) => q.slice(1))}
        />
      )}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCelebrate(): CelebrationContextValue {
  const c = useContext(Ctx)
  if (!c) throw new Error('useCelebrate must be used within CelebrationProvider')
  return c
}
