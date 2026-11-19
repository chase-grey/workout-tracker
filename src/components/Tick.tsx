import { useState } from 'react'
import { tickDirection } from '../lib/motion'

/**
 * A number that rolls into place when it changes: up when it grew, down when it
 * shrank. Still on first paint — a screen full of numbers arriving is not a
 * screen full of numbers changing — and still from then on until the value
 * itself moves, however often the card around it re-renders.
 */
export function Tick({ value }: { value: string | number }) {
  const [shown, setShown] = useState<{ value: string | number; roll: 'up' | 'down' | null }>({
    value,
    roll: null,
  })
  // Derived during render rather than in an effect, so the new number is never
  // painted once without its roll.
  let roll = shown.roll
  if (shown.value !== value) {
    roll = tickDirection(shown.value, value)
    setShown({ value, roll })
  }
  return (
    <span key={String(value)} className={`inline-block ${roll ? `tick-${roll}` : ''}`}>
      {value}
    </span>
  )
}
