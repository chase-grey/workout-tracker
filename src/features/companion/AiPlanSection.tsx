import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { hasPillar } from '../../lib/profile'
import type { Settings } from '../../services/storage'
import { PressButton, SETTINGS_BUTTON } from '../settings/PressButton'
import { LiveCompanion } from './CompanionFlow'
import { useCompanion } from './useCompanion'

/** Whether the coach was set up as copy-and-paste into another AI app, with no key in its place. */
export const pastesToAi = (s: Settings) => Boolean(s.coachPaste) && !s.coachEnabled

/**
 * The way into the copy-paste companion, and the undo for its last change while
 * that is still open (see lib/companion/undo). `primary` dresses the open
 * button as the section's main action.
 */
export function AiPlanButtons({ primary }: { primary?: boolean }) {
  const { settings } = useData()
  const { last, undo } = useCompanion()
  const [open, setOpen] = useState(false)
  if (!hasPillar(settings.profile, 'strength')) return null
  const when = last
    ? new Date(last.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null
  return (
    <>
      <PressButton
        onPress={() => setOpen(true)}
        className={primary ? 'min-h-[44px] rounded-xl bg-accent font-semibold text-on-accent active:opacity-80' : SETTINGS_BUTTON}
      >
        edit plan with your AI
      </PressButton>
      {last && (
        <PressButton onPress={undo} className={`${SETTINGS_BUTTON} text-neutral-300`}>
          undo AI change · {when}
        </PressButton>
      )}
      {open && <LiveCompanion sheet onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * Settings' way into the companion, beside the plan answers. Someone who chose
 * copy-and-paste for their coach finds it in the coach section instead (see
 * settings/SetupSection PasteCoachSection), as that section's main action.
 */
export function AiPlanSection() {
  const { settings } = useData()
  if (!hasPillar(settings.profile, 'strength') || pastesToAi(settings)) return null
  return (
    <section className="flex flex-col gap-2">
      <AiPlanButtons />
    </section>
  )
}
