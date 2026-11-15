import { FLEX_ROUTINES, FLEX_ROUTINE_KEYS, type FlexRoutineKey } from '../config/flexRoutines'
import { toggleFlexSkill } from '../lib/flexSkills'
import { PressButton } from '../features/settings/PressButton'

const chip = (on: boolean) =>
  `min-h-[52px] rounded-xl text-sm font-semibold ${on ? 'bg-accent text-on-accent' : 'bg-surface text-neutral-400'}`

/**
 * The flexibility skills to train, or "just track sessions". `value` null is
 * unanswered; [] is the sessions-only answer (see lib/flexSkills).
 */
export function FlexSkillPicker({
  value,
  onChange,
  labelClass,
}: {
  value: FlexRoutineKey[] | null
  onChange: (next: FlexRoutineKey[]) => void
  /** Left out where the picker already sits under a heading of its own. */
  labelClass?: string
}) {
  const sessionsOnly = value !== null && value.length === 0
  return (
    <div role="group" aria-label="flexibility" className="flex flex-col gap-2">
      {labelClass && <span className={labelClass}>flexibility</span>}
      <div className="grid grid-cols-2 gap-2">
        {FLEX_ROUTINE_KEYS.map((k) => {
          const on = !!value?.includes(k)
          return (
            <PressButton key={k} onPress={() => onChange(toggleFlexSkill(value, k))} pressed={on} className={chip(on)}>
              {FLEX_ROUTINES[k].label}
            </PressButton>
          )
        })}
        <PressButton
          onPress={() => onChange(toggleFlexSkill(value, null))}
          pressed={sessionsOnly}
          className={`col-span-2 ${chip(sessionsOnly)}`}
        >
          just track sessions
        </PressButton>
      </div>
    </div>
  )
}
