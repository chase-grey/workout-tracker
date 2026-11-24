import { useState } from 'react'
import { MdHelpOutline } from 'react-icons/md'
import { useBackGuard } from '../lib/useBackGuard'
import { HowToSheet } from './HowToSheet'

/**
 * The `?` beside a movement's name: opens how it's done (see HowToSheet).
 *
 * On its own it keeps the sheet itself, which is all a list needs. A session
 * screen passes `onOpen` instead and draws the sheet from its own state, since
 * a sheet over a set has to stop the set's clock (see ActiveSession's
 * `setScreenLive`, StretchSession's `setLive`), and only the session can.
 *
 * `inline` sits it in a line of text, after a title: the glyph at the text's
 * own height, with the 44px target reaching past it on every side rather than
 * opening the line up.
 */
export function HowToButton({
  exerciseKey,
  name,
  dumbbells,
  onOpen,
  inline = false,
  className = '',
}: {
  exerciseKey: string
  name: string
  dumbbells?: boolean
  onOpen?: () => void
  inline?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  useBackGuard(open, () => setOpen(false))

  const shape = inline
    ? 'relative -my-2 ml-1 inline-flex h-[1em] w-[1em] items-center justify-center align-[-0.12em] text-[max(0.8em,1.125rem)] before:absolute before:-inset-3 before:content-[""]'
    : 'flex min-h-[44px] w-9 shrink-0 items-center justify-center text-xl'

  return (
    <>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          if (onOpen) onOpen()
          else setOpen(true)
        }}
        aria-label={`how to do ${name}`}
        className={`${shape} rounded-xl text-neutral-500 active:bg-surface-2 active:text-neutral-300 ${className}`}
      >
        <MdHelpOutline aria-hidden />
      </button>
      {open && (
        <HowToSheet exerciseKey={exerciseKey} name={name} dumbbells={dumbbells} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

/**
 * A title with its `?` after the last word, the two kept on one line: a `?`
 * that wrapped by itself would cost the screen a row for a glyph.
 */
export function TitleWithHowTo({
  title,
  ...button
}: { title: string } & Omit<Parameters<typeof HowToButton>[0], 'inline' | 'className'>) {
  const cut = title.trimEnd().lastIndexOf(' ') + 1
  return (
    <>
      {title.slice(0, cut)}
      <span className="whitespace-nowrap">
        {title.slice(cut)}
        <HowToButton inline {...button} />
      </span>
    </>
  )
}
