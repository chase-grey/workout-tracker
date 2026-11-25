import { FLEX_ROUTINES, type FlexRoutineKey } from '../../config/flexRoutines'
import { sideSwitchSecOf, switchesSides, withSideSwitchSec, SIDE_SWITCH_MIN_SEC } from '../../lib/flexSteps'
import { useData } from '../../store/DataContext'
import { NumberField } from './PlanEditor'

/**
 * How long each one-side-at-a-time stretch gives you to change sides.
 *
 * Per exercise, because what a change of side is differs: shifting weight to
 * the other foot, or getting up off one knee and down onto the other. Kept
 * with the routine on this device, like the rest of a stretch plan.
 */
export function SideSwitchSetting({ routines }: { routines: FlexRoutineKey[] }) {
  const { flexPlans, updateFlexPlan } = useData()
  const groups = routines
    .map((routine) => {
      const blocks = flexPlans[routine] ?? FLEX_ROUTINES[routine].blocks
      // An exercise a routine lists twice is still one setting.
      const seen = new Set<string>()
      const exercises = blocks
        .flatMap((b) => b.exercises)
        .filter((ex) => switchesSides(ex) && !seen.has(ex.key) && !!seen.add(ex.key))
      return { routine, blocks, exercises }
    })
    .filter((g) => g.exercises.length > 0)
  if (groups.length === 0) return null

  return (
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-300">seconds to switch sides</label>
      {groups.map(({ routine, blocks, exercises }) => (
        <div key={routine} className="flex flex-col gap-2">
          <span className="text-sm font-semibold">{FLEX_ROUTINES[routine].label}</span>
          <div className="grid grid-cols-2 gap-2">
            {exercises.map((ex) => (
              <NumberField
                key={ex.key}
                label={ex.name}
                value={sideSwitchSecOf(ex)}
                onChange={(sec) => {
                  if (sec >= SIDE_SWITCH_MIN_SEC) updateFlexPlan(routine, withSideSwitchSec(blocks, ex.key, sec))
                }}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
