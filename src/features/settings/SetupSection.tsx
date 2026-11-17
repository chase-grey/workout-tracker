import { useMemo, useState, type ReactNode } from 'react'
import { MdKeyboardArrowDown } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { ownerFlavour } from '../../lib/profile'
import { buildSystemPrompt } from '../../lib/chatPrompt'
import { emptyForm, formFromProfile, mergeSetup, planNeedsReplacing } from '../../lib/welcomeForm'
import { DEFAULT_STRENGTH, planFor, rebuildPlan } from '../../config/planTemplates'
import { SetupEditor, type SetupResult } from '../setup/Welcome'
import { PressButton, SETTINGS_BUTTON, SETTINGS_FIELD, SETTINGS_LABEL } from './PressButton'
import { AiPlanButtons, pastesToAi } from '../companion/AiPlanSection'

/** The setup form over the whole app, in the shell's own sizing so the keyboard shrinks it as it does everywhere. */
function Overlay({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] bg-bg">
      <div className="app-shell overflow-y-auto">{children}</div>
    </div>
  )
}

/** Words that must be typed to arm the restart. */
const RESTART_WORD = 'restart'

/**
 * Setup run again from Settings. "update goals" opens the welcome form filled
 * in from the profile and folds the answers back in; a changed goal or calorie
 * target takes effect from now on and the logged history is never touched. The
 * workout plan is replaced only when lifting days or equipment moved the
 * starter plan's shape, and only if asked.
 */
export function UpdateGoals() {
  const { settings, updateSettings, plan, updatePlan, logBodyWeight, bodyWeights } = useData()
  const [open, setOpen] = useState(false)
  // A saved form waiting on the answer to "replace your workout plan?".
  const [confirm, setConfirm] = useState<{ profile: NonNullable<typeof settings.profile>; r: SetupResult } | null>(null)
  const profile = settings.profile
  const latestWeight = useMemo(
    () => [...bodyWeights].sort((a, b) => b.date.localeCompare(a.date))[0]?.weightLbs ?? null,
    [bodyWeights],
  )
  if (!profile || ownerFlavour(profile)) return null

  const apply = (merged: NonNullable<typeof settings.profile>, r: SetupResult, replacePlan: boolean) => {
    updateSettings({
      ...settings,
      profile: merged,
      calendarPins: r.schedule,
      ...(r.heightIn != null && { heightIn: r.heightIn }),
    })
    if (replacePlan && merged.strength) updatePlan(rebuildPlan(plan, profile?.strength, merged.strength))
    if (r.weightLbs != null && r.weightLbs !== latestWeight) void logBodyWeight(r.weightLbs)
    setConfirm(null)
    setOpen(false)
  }

  const finish = async (r: SetupResult) => {
    const merged = mergeSetup(profile, r.profile)
    if (planNeedsReplacing(profile.strength, merged.strength)) setConfirm({ profile: merged, r })
    else apply(merged, r, false)
  }

  return (
    <>
      <PressButton onPress={() => setOpen(true)} className={SETTINGS_BUTTON}>
        update goals
      </PressButton>
      {open && (
        <Overlay>
          <SetupEditor
            initial={formFromProfile(profile, {
              heightIn: settings.heightIn,
              weightLbs: latestWeight,
              pins: settings.calendarPins,
            })}
            heading="update goals"
            submitLabel="save"
            onFinish={finish}
            onCancel={() => setOpen(false)}
          />
          {confirm && (
            <div className="fixed inset-0 z-[80] flex items-end bg-black/60 sm:items-center sm:justify-center">
              <div className="flex w-full flex-col gap-3 rounded-t-2xl bg-surface p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-2xl">
                <h2 className="text-lg font-bold">replace your workout plan?</h2>
                <p className="text-sm text-neutral-300">
                  your lifting answers changed. a new plan is built from them. exercises you added yourself stay;
                  edits to the built ones don't. your logged workouts stay.
                </p>
                <PressButton
                  onPress={() => apply(confirm.profile, confirm.r, true)}
                  className="min-h-[48px] rounded-xl bg-accent font-semibold text-on-accent"
                >
                  replace plan
                </PressButton>
                <PressButton
                  onPress={() => apply(confirm.profile, confirm.r, false)}
                  className="min-h-[48px] rounded-xl bg-surface-2 font-medium"
                >
                  keep my plan
                </PressButton>
                <PressButton
                  onPress={() => setConfirm(null)}
                  className="min-h-[44px] rounded-xl text-sm font-medium text-neutral-400"
                >
                  back to the form
                </PressButton>
              </div>
            </div>
          )}
        </Overlay>
      )}
    </>
  )
}

/**
 * The bottom of Settings' plan page: a folded-away way to run setup from the
 * top. Nothing is erased on confirming: the blank form opens, and only
 * finishing it replaces the profile, weekly goals, calorie target and workout
 * plan. Logged workouts, weigh-ins and meals live in the account and stay, as
 * do the account itself, stretch routines and coach settings.
 */
export function RestartAccount() {
  const { settings, updateSettings, updatePlan, logBodyWeight } = useData()
  const [expanded, setExpanded] = useState(false)
  const [typed, setTyped] = useState('')
  const [running, setRunning] = useState(false)
  if (!settings.profile || ownerFlavour(settings.profile)) return null

  const armed = typed.trim().toLowerCase() === RESTART_WORD

  const finish = async (r: SetupResult) => {
    updateSettings({
      ...settings,
      profile: r.profile,
      calendarPins: r.schedule,
      ...(r.heightIn != null && { heightIn: r.heightIn }),
    })
    updatePlan(planFor(r.profile.strength ?? DEFAULT_STRENGTH))
    if (r.weightLbs != null) void logBodyWeight(r.weightLbs)
    setRunning(false)
    setExpanded(false)
    setTyped('')
  }

  return (
    <section className="flex flex-col gap-2">
      <PressButton
        onPress={() => setExpanded(!expanded)}
        pressed={expanded}
        className="flex min-h-[44px] items-center gap-1 self-start text-sm text-neutral-500 active:text-neutral-300"
      >
        start over
        <MdKeyboardArrowDown className={`text-lg ${expanded ? 'rotate-180' : ''}`} aria-hidden />
      </PressButton>
      {expanded && (
        <div className="flex flex-col gap-3 rounded-xl bg-surface p-3">
          <label className={SETTINGS_LABEL}>restart my account</label>
          <p className="text-sm text-neutral-300">
            this clears your profile, weekly goals, calorie target and workout plan once you finish setup again. your
            logged workouts, weigh-ins and meals are not erased, and neither are your account, stretch routines or
            coach settings.
          </p>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={`type ${RESTART_WORD}`}
            aria-label={`type ${RESTART_WORD} to confirm`}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className={SETTINGS_FIELD}
          />
          <PressButton onPress={() => setRunning(true)} disabled={!armed} className={SETTINGS_BUTTON}>
            restart my account
          </PressButton>
        </div>
      )}
      {running && (
        <Overlay>
          <SetupEditor
            initial={emptyForm()}
            heading="start over"
            submitLabel="start over"
            onFinish={finish}
            onCancel={() => setRunning(false)}
          />
        </Overlay>
      )}
    </section>
  )
}

/**
 * The coach section for someone who chose to take their training to another AI
 * app at setup. Its main action is the two-way companion, which changes the
 * plan from the AI's reply. The training summary stays under it for everything
 * else: the coach's own briefing, plan and recent history, for an open
 * conversation the companion's plan-change format doesn't hold.
 */
export function PasteCoachSection() {
  const { settings, plan, workouts, bodyWeights, streaks, cardioEntries } = useData()
  const [copied, setCopied] = useState(false)
  if (!pastesToAi(settings)) return null

  const copy = async () => {
    const text = [
      'Below is my training data, for you to answer my fitness questions from. Ignore any mention of app tools; you cannot call them here.',
      '',
      buildSystemPrompt({
        today: new Date(),
        plan,
        workouts,
        bodyWeights,
        streaks,
        skills: { planEdits: false, issues: false },
        profile: settings.profile,
        cardio: cardioEntries,
        heightIn: settings.heightIn,
      }),
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked: nothing to confirm */
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <label className={SETTINGS_LABEL}>ai coach</label>
      <AiPlanButtons primary />
      <PressButton onPress={() => void copy()} className={SETTINGS_BUTTON}>
        {copied ? 'copied ✓' : 'copy my training summary'}
      </PressButton>
    </section>
  )
}
