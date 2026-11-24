import { flushSync } from 'react-dom'

/**
 * A clock the shots page winds by hand, so a figure can be put at an exact
 * moment of its tempo (mid-push, the rest, the closing rep) and held there for
 * a screenshot, in any browser.
 *
 * Only what the animations read is replaced: `performance.now` and the
 * animation frame queue. `Date`, `setTimeout` and `setInterval` are left real,
 * because the rest and hold clocks are told where they are through `endsAt`
 * and `fraction` instead.
 */

type Frame = (now: number) => void

const realRaf = window.requestAnimationFrame.bind(window)
const FRAME_MS = 1000 / 60

let now = 1000
let nextId = 1
const queue = new Map<number, Frame>()

export function installClock() {
  performance.now = () => now
  window.requestAnimationFrame = (cb: Frame) => {
    const id = nextId++
    queue.set(id, cb)
    return id
  }
  window.cancelAnimationFrame = (id: number) => {
    queue.delete(id)
  }
}

/**
 * Run the animation frames for the next `ms`, one sixtieth of a second apart.
 * Each frame is flushed through React on the spot, effects included, so a
 * frame that re-arms itself from an effect is queued before the next one runs.
 */
export function advance(ms: number) {
  const end = now + ms
  while (now < end) {
    now = Math.min(end, now + FRAME_MS)
    const due = [...queue.values()]
    queue.clear()
    flushSync(() => {
      for (const frame of due) frame(now)
    })
  }
}

/** Two real frames and a pause: the browser has painted, and CSS has settled. */
export function painted(settleMs: number): Promise<void> {
  return new Promise((resolve) => {
    realRaf(() => realRaf(() => setTimeout(resolve, settleMs)))
  })
}
