import { useRef } from 'react'

/**
 * A control's starter word (see lib/controlLabels), drawn inside its button.
 *
 * `stack` puts it under the glyph within the button's own 44px box, for the
 * session header and checklist rows, where a word beside each glyph would squeeze
 * the title or the set fields at phone width; the button's footprint is the
 * same with or without it. `inline` sets it beside the glyph, for controls that
 * already have room across.
 *
 * Going away, it collapses and fades rather than vanishing, so the glyph glides
 * back to centre instead of jumping. A word never shown since mount renders
 * nothing at all, so a device with labels off draws exactly what it always did.
 */
export function ControlWord({
  show,
  word,
  layout = 'stack',
}: {
  show: boolean
  word: string
  layout?: 'stack' | 'inline'
}) {
  const shown = useRef(show)
  if (show) shown.current = true
  if (!shown.current) return null

  const stack = layout === 'stack'
  const track = stack
    ? show
      ? 'grid-rows-[1fr]'
      : 'grid-rows-[0fr]'
    : show
      ? 'grid-cols-[1fr]'
      : 'grid-cols-[0fr]'
  return (
    <span
      aria-hidden
      className={`grid transition-[grid-template-rows,grid-template-columns,opacity] duration-500 ease-out motion-reduce:transition-none ${track} ${
        show ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <span
        className={`min-h-0 min-w-0 overflow-hidden whitespace-nowrap font-semibold tracking-wide ${
          stack ? 'pt-0.5 text-[10px] leading-3' : 'pl-1.5 text-xs leading-4'
        }`}
      >
        {word}
      </span>
    </span>
  )
}
