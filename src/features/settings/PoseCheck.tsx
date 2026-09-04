import { useState } from 'react'
import { clearPoseCache, lastPoseError, probePose, type PoseProbe } from '../../lib/pose'
import { formatLastError, formatProbe } from '../../lib/poseReport'

const button = 'min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2'

/**
 * Check the pose detector on the device that can't load it.
 *
 * Measuring fails on the phone and nowhere else, and a phone has no console: all
 * the angle editor could ever say was that the model didn't load, which is the
 * one thing already known. This fetches each file the detector needs, reports
 * what came back, then tries to build the detector for real — so the next report
 * is a status code or an instantiation error rather than another guess.
 *
 * It also shows the last failure a measurement hit, which is the reading that
 * matters most: it comes from the real attempt, not from pressing this.
 */
export function PoseCheck() {
  const [probe, setProbe] = useState<PoseProbe | null>(null)
  const [running, setRunning] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [stored, setStored] = useState(lastPoseError)

  const run = async () => {
    setRunning(true)
    setProbe(null)
    setCleared(false)
    try {
      setProbe(await probePose())
    } finally {
      setStored(lastPoseError())
      setRunning(false)
    }
  }

  const drop = async () => {
    await clearPoseCache()
    setProbe(null)
    setStored(null)
    setCleared(true)
  }

  // A fresh probe supersedes the stored failure — it's the newer answer, and
  // showing both invites reading the old one as the current state.
  const storedLine = probe ? null : formatLastError(stored)

  return (
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-300">pose model</label>
      {storedLine && <p className="text-xs break-words text-neutral-500">{storedLine}</p>}
      {probe && (
        <div className="flex flex-col gap-0.5 font-mono text-xs break-words text-neutral-400">
          {formatProbe(probe).map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
      <button onClick={() => void run()} disabled={running} className={`${button} disabled:text-neutral-500`}>
        {running ? 'checking…' : 'check pose model'}
      </button>
      <button onClick={() => void drop()} disabled={running} className={`${button} disabled:text-neutral-500`}>
        {cleared ? 'cleared ✓' : 'clear cached model'}
      </button>
    </section>
  )
}
