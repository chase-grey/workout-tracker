import type { ReactNode } from 'react'
import { usePressAction } from '../../lib/usePressAction'

/**
 * A button that fires on release even when the press blurred a field and the
 * keyboard's closing reflowed the page. A disabled one swallows the press
 * instead, since a native `disabled` gets no pointer events.
 */
export function PressButton({
  onPress,
  disabled,
  className,
  pressed,
  label,
  children,
}: {
  onPress: () => void
  disabled?: boolean
  className: string
  pressed?: boolean
  label?: string
  children: ReactNode
}) {
  const press = usePressAction(() => {
    if (!disabled) onPress()
  })
  return (
    <button
      type="button"
      {...press}
      aria-disabled={disabled || undefined}
      aria-pressed={pressed}
      aria-label={label}
      className={className}
    >
      {children}
    </button>
  )
}

export const SETTINGS_FIELD =
  'min-h-[44px] rounded-xl bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent'
export const SETTINGS_LABEL = 'text-sm font-medium text-neutral-300'
export const SETTINGS_BUTTON =
  'min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2 aria-disabled:text-neutral-600'
