import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { hasPillar } from '../../lib/profile'
import { PressButton, SETTINGS_BUTTON } from '../settings/PressButton'
import { LiveCompanion } from './CompanionFlow'
import { useCompanion } from './useCompanion'

/**
 * Settings' way into the copy-paste companion, beside the plan answers, and the
 * undo for its last change while that is still open (see lib/companion/undo).
 */
export function AiPlanSection() {
  const { settings } = useData()
  const { last, undo } = useCompanion()
  const [open, setOpen] = useState(false)
  if (!hasPillar(settings.profile, 'strength')) return null
  const when = last
    ? new Date(last.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : null
  return (
    <section className="flex flex-col gap-2">
      <PressButton onPress={() => setOpen(true)} className={SETTINGS_BUTTON}>
        edit plan with your AI
      </PressButton>
      {last && (
        <PressButton onPress={undo} className={`${SETTINGS_BUTTON} text-neutral-300`}>
          undo AI change · {when}
        </PressButton>
      )}
      {open && <LiveCompanion sheet onClose={() => setOpen(false)} />}
    </section>
  )
}
