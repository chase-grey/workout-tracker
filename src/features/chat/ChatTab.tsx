import { useEffect, useRef, useState } from 'react'
import { holdUpdates } from '../../lib/version'
import { useData } from '../../store/DataContext'
import { buildSystemPrompt, reportToggleLabel, type CoachSkills } from '../../lib/chatPrompt'
import { loadCoachSwitches, saveCoachSwitches } from '../../lib/coachSwitches'
import { coachFeedbackMessage } from '../../lib/coachFeedback'
import { APP_COMMIT } from '../../lib/version'
import { api } from '../../services/api'
import { reportFilingFailure } from '../../services/saveErrors'
import type { RawMessage, Tool } from '../../services/openai'
import { coachTurn } from '../../services/coach'
import { modelChoices, modelFor } from '../../lib/aiProvider'
import { ownerFlavour, type Profile } from '../../lib/profile'
import { coachStarters } from '../../lib/coachStarters'
import { applyPlanEdits, PLAN_EDIT_OPS, type PlanEdit } from '../../lib/planTools'
import { circuitRounds, circuitTitle, dayEntries, roundsLabel } from '../../lib/circuitEntry'
import { applyFlexPlanEdits, type FlexEdit } from '../../lib/flexTools'
import {
  answerIssue,
  fetchIssueThread,
  latestQuestion,
  reportIssue,
  type IssueArea,
} from '../../services/issues'
import { refreshIssues } from '../../store/useTrackedIssues'
import { dayOrder, exerciseName, repRangeLabel, type Plan, type PlannedExercise } from '../../config/plan'
import { DAY_TYPES, STRETCH_CORE } from '../../config/plan'
import { logsStretchOnly, stretchRoutinesFor } from '../../lib/flexSkills'
import {
  DISCOMFORT_SPOTS,
  discomfortEdit,
  knownSpots,
  lastSessionWith,
  type NotesEdit,
} from '../../lib/discomfort'
import { fmtSessionDate } from '../../lib/exerciseHistory'
import type { FlexBlock } from '../../config/flexPlan'
import {
  FLEX_ROUTINES,
  FLEX_ROUTINE_KEYS,
  type FlexRoutineKey,
} from '../../config/flexRoutines'
import { MdBuild, MdClose, MdHelpOutline, MdArrowForward } from 'react-icons/md'
import { Markdown } from './Markdown'
import { expectKeyboard, overlayKeyboard } from '../../lib/viewport'
import { useKeyboardOpen } from '../../lib/useKeyboardOpen'
import { ProposalCard, type ProposalStatus } from '../../components/ProposalCard'
import { LiveCompanion } from '../companion/CompanionFlow'

/**
 * A change the coach wants to make, held until the user says yes.
 *
 * The coach reaches for the nearest tool when it can't do what was asked — told
 * to add a flexibility goal, with no goal tool to hand, it went and invented two
 * stretches instead. So an edit is never written straight through: the pure
 * apply* function produces the whole resulting plan, that snapshot waits here
 * behind an approve button, and only a tap commits it.
 */
type Proposal = {
  /** What the edits do, one line each, as shown to the user. */
  changes: string[]
  status: ProposalStatus
} & (
  // The first two carry the whole plan/routine the edits produce, saved verbatim
  // on approval; the third carries the finished note for one logged exercise
  // (see lib/discomfort).
  | { kind: 'plan'; next: Plan }
  | { kind: 'flex'; next: Record<FlexRoutineKey, FlexBlock[]> }
  | { kind: 'discomfort'; edit: NotesEdit }
)

type Turn = {
  role: 'user' | 'assistant' | 'system'
  content: string
  error?: boolean
  /** Set on a system turn that is asking for approval rather than reporting. */
  proposal?: Proposal
}

// ChatTab unmounts whenever you leave the coach tab or start a workout, so the
// toggles and the thread outlive the component — otherwise "keep context" would
// forget itself the moment you looked at anything else.
//
// The three switches are kept on the device (lib/coachSwitches): each stays as
// it was left until it is tapped again, through a reload or a closed app. On a
// device that has never set them they all start off: most days nothing about
// the plan changes and nothing needs writing up, the two plan tools are by far
// the largest schemas we send, and a report tool that is always there gets
// used when nobody asked for a report. The thread itself is not kept.
const kept = loadCoachSwitches()
const session: { keepContext: boolean; skills: CoachSkills; turns: Turn[] } = {
  keepContext: kept.keepContext,
  skills: { planEdits: kept.planEdits, issues: kept.issues },
  turns: [],
}
const keepSwitches = () => saveCoachSwitches({ ...session.skills, keepContext: session.keepContext })

const UPDATE_PLAN_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'update_plan',
    description:
      "Propose an edit to the user's Push/Pull workout plan: change an exercise's sets/rep range/rest/name/group, add or remove an exercise, reorder the exercises in a day, reorder the days themselves, or rename a day. Only call when the user asks to change their plan. Nothing is saved until the user approves the proposal in the app. This tool cannot create or change goals — pass those to the developer with report_issue or send_feedback, whichever you have. " +
      'The order of a day is the order it is performed in, and you can change it: moveExercise puts one exercise before/after another (or at toIndex, the 1-based positions shown in the snapshot minus one), and reorderDay takes the whole day as a list of keys front to back. Reordering is never a reason to remove and re-add an exercise — that would lose its history. ' +
      'The days have an order of their own — the order the app offers them in, shown in the snapshot — and reorderDays sets it, listing the day types front to back. It takes `days` and no `day`; every other op needs `day`. ' +
      'Exercises marked circuit=<id> in the snapshot are performed as a rotation, one set at each station in turn, and their rest is per station: circuitRestSec on an exercise is the rest taken AFTER each of its sets in the rotation, where 0 rolls straight on to the next station and null hands the station back to the default timing. restSec is not what the user feels inside a circuit — to rest only after one station, set circuitRestSec on every station of that circuit, 0 on the ones to roll through. ' +
      'A circuit is one block of the day and the app shows it as one: moving any station of it with moveExercise carries the whole circuit (unless it lands inside the circuit, which reorders the stations), nothing can be moved in between two of its stations, and adding a station of a shipped circuit the day has lost brings the whole circuit back. Removing a station removes just that station. Its rounds are its stations\' sets — to change them, set sets on every station.',
    parameters: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          description: 'Edits applied in order.',
          items: {
            type: 'object',
            properties: {
              op: { type: 'string', enum: [...PLAN_EDIT_OPS] },
              day: {
                type: 'string',
                enum: [...DAY_TYPES],
                description: 'the day to edit — required by every op except reorderDays',
              },
              key: {
                type: 'string',
                description: 'exercise key (setExercise / removeExercise / moveExercise)',
              },
              before: {
                type: 'string',
                description: 'move it directly before this exercise key (moveExercise)',
              },
              after: {
                type: 'string',
                description: 'move it directly after this exercise key (moveExercise)',
              },
              toIndex: {
                type: 'number',
                description: '0-based destination position, when no neighbour is named (moveExercise)',
              },
              keys: {
                type: 'array',
                items: { type: 'string' },
                description: "the day's exercise keys in the order to perform them (reorderDay)",
              },
              days: {
                type: 'array',
                items: { type: 'string', enum: [...DAY_TYPES] },
                description: 'the day types in the order to offer them (reorderDays)',
              },
              label: { type: 'string', description: 'new day label (setDayLabel)' },
              fields: {
                type: 'object',
                description:
                  'fields to change (setExercise): name, sets, repMin, repMax, restSec, circuitRestSec, increment, bodyweight, group',
              },
              exercise: {
                type: 'object',
                description: 'new exercise (addExercise): name, sets, repMin, repMax, restSec, group, bodyweight, increment',
              },
            },
            required: ['op'],
          },
        },
      },
      required: ['edits'],
    },
  },
}

const UPDATE_FLEX_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'update_flex_routine',
    description:
      "Propose an edit to one of the user's two stretch routines: change/add/remove a stretch, add/remove a block, or set a block note. Every edit must name the routine it applies to — 'side_split' or 'head_to_toe' — and blocks are matched by label within that routine. Only call when the user asks to change which stretches they do. Nothing is saved until the user approves the proposal in the app. This tool does not create flexibility goals or change their target angles — a request for a goal at some number of degrees is not a request for a new stretch, so pass it to the developer with report_issue or send_feedback, whichever you have.",
    parameters: {
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          description: 'Edits applied in order.',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: ['setExercise', 'addExercise', 'removeExercise', 'addBlock', 'removeBlock', 'setBlockNote'],
              },
              routine: {
                type: 'string',
                enum: [...FLEX_ROUTINE_KEYS],
                description: 'which routine this edit applies to; defaults to side_split',
              },
              block: { type: 'string', description: 'block label' },
              key: { type: 'string', description: 'stretch key (setExercise / removeExercise)' },
              label: { type: 'string', description: 'new block label (addBlock)' },
              note: { type: 'string', description: 'block note (setBlockNote / addBlock)' },
              fields: { type: 'object', description: 'fields to change (setExercise): name, sets, maxSets, reps, tempo, holdSec, restSec, sideSwitchSec' },
              exercise: { type: 'object', description: 'new stretch (addExercise): name, sets, maxSets, reps, tempo, restSec' },
            },
            required: ['op'],
          },
        },
      },
      required: ['edits'],
    },
  },
}

const FLAG_DISCOMFORT_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'flag_discomfort',
    description:
      'Record on a workout the user has already logged that a joint felt off during one of its exercises — a knee that felt weird on leg press, a shoulder that pinched on overhead press. ' +
      'Call whenever they mention pain, a twinge or an odd sensation and it is clear which movement it came from, including — especially — when they only bring it up hours afterwards: the flag they can tap themselves is only reachable while the workout is still running, so if you do not record it here it does not get recorded at all. ' +
      'The flag is filed against that exercise so a repeat on the same movement shows up beside it next time. It changes nothing about their plan, their weights or their rest, and it is not a step towards changing them — do not follow it with update_plan. ' +
      'Pass every spot they name in one call: it replaces that exercise\'s flags for that session, so an empty list clears them. Nothing is saved until the user approves it in the app.',
    parameters: {
      type: 'object',
      properties: {
        exercise: {
          type: 'string',
          description: 'exercise key, exactly as listed in the plan snapshot',
        },
        spots: {
          type: 'array',
          items: { type: 'string', enum: [...DISCOMFORT_SPOTS] },
          description: "where it felt off — empty to clear that exercise's flags for the session",
        },
        date: {
          type: 'string',
          description:
            'YYYY-MM-DD of the session it happened in; omit for the most recent session that logged the exercise',
        },
      },
      required: ['exercise', 'spots'],
    },
  },
}

const REPORT_ISSUE_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'report_issue',
    description:
      'File a bug or feature request about the workout app itself as a GitHub issue. ' +
      'Call when the user asks to report a problem, says something is broken, or ' +
      'wants a change filed — and also whenever they ask for an app change the other ' +
      'tools cannot make, such as a new or changed goal, a chart, a screen, or ' +
      'different app behaviour. Not for questions about their training. Confirm the ' +
      'created issue number/link back to the user.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short one-line summary of the issue.' },
        body: {
          type: 'string',
          description: 'Details: what happens, steps to reproduce, and what was expected.',
        },
        area: {
          type: 'string',
          enum: ['plan', 'chat', 'timer', 'history', 'other'],
          description: 'Which part of the app the issue is about.',
        },
      },
      required: ['title'],
    },
  },
}

/**
 * report_issue for everyone but the owner: the same report, saved as a row in
 * the owner's feedback tab rather than filed on GitHub (see lib/coachFeedback).
 */
const SEND_FEEDBACK_TOOL: Tool = {
  type: 'function',
  function: {
    name: 'send_feedback',
    description:
      'Pass a bug report or feature request about the workout app itself on to its developer. ' +
      'Call when the user asks to report a problem, says something is broken, or ' +
      'wants a change made — and also whenever they ask for an app change the other ' +
      'tools cannot make, such as a new or changed goal, a chart, a screen, or ' +
      'different app behaviour. Not for questions about their training. Tell the ' +
      'user it was sent; there is no issue number or link.',
    parameters: REPORT_ISSUE_TOOL.function.parameters,
  },
}

/**
 * The circuit an exercise belongs to and the rest it takes after each of its sets
 * in the rotation — without both, the coach can't tell a circuit station from an
 * ordinary exercise, or see which stations already roll straight on.
 */
function circuitNote(e: PlannedExercise): string {
  if (!e.circuit) return ''
  const rest =
    e.circuitRestSec == null ? 'circuitRestSec unset (default)' : `circuitRestSec ${e.circuitRestSec}s`
  return `, circuit=${e.circuit}, ${rest}`
}

/**
 * Where a movement's load ends, or that it can't be loaded at all. Without the
 * note the coach suggests adding weight the gym hasn't got — a pair of 55s, a 16th
 * plate — or that the exercise can't take (see PlannedExercise.weightCapLbs /
 * repLadder). Said as the ceiling rather than as "reps only", because a capped
 * movement still earns weight until it gets there.
 */
function capNote(e: PlannedExercise): string {
  if (e.repLadder) return ', takes no weight at all — progress by reps only'
  if (e.weightCapLbs == null) return ''
  // A numbered stack: the figure is a pin setting, not pounds, so a step is one
  // setting and the top of the stack is the end of the weight ladder.
  if (e.stackSetting) {
    return `, loaded as a stack setting from 1 to ${e.weightCapLbs} (not lbs) — step it by 1, never suggest above ${e.weightCapLbs}, and at ${e.weightCapLbs} progress by reps only`
  }
  return `, ${e.weightCapLbs} lbs is the heaviest available — never suggest more; at ${e.weightCapLbs} progress by reps only`
}

/**
 * A compact snapshot of the current plans so the assistant knows exact keys.
 *
 * It goes even with plan editing switched off: flag_discomfort takes a key from
 * here too, and the stretch routine appears nowhere else in the context.
 */
function planSnapshot(
  plan: Plan,
  flexPlans: Record<FlexRoutineKey, FlexBlock[]>,
  planEdits: boolean,
  profile?: Profile | null,
): string {
  const owner = ownerFlavour(profile)
  const lines = [
    `CURRENT WORKOUT PLAN (use these exact keys${planEdits ? ' with update_plan' : ''}):`,
  ]
  // Listed in the order the app offers the days, and numbered, so the coach can
  // both read the current day order and be asked to change it (reorderDays).
  const days = dayOrder(plan)
  lines.push(`day order: ${days.map((d, i) => `${i + 1}. ${d}`).join(', ')}`)
  for (const d of days) {
    if (plan[d].exercises.length === 0) continue
    lines.push(`${plan[d].label} (${d}), listed in the order it is performed:`)
    // A circuit is headed as the one block it is, with its stations numbered under
    // it — still one number per exercise, since those are the positions toIndex
    // counts in.
    let n = 0
    for (const entry of dayEntries(plan[d].exercises)) {
      const indent = entry.kind === 'circuit' ? '    ' : '  '
      if (entry.kind === 'circuit') {
        const rounds = circuitRounds(entry.stations.map((e) => e.sets))
        const roundRest = entry.stations[0].circuitRoundRestSec
        lines.push(
          `  ${circuitTitle(entry.stations)} — ${roundsLabel(rounds)}${entry.stations.every((e) => e.roundScreen) ? ', done a round at a time (every station back to back on one screen, then one rest)' : ''}${roundRest == null ? '' : `, ${roundRest}s rest after each round`}; its stations, in the order each round runs them:`,
        )
      }
      for (const e of entry.kind === 'circuit' ? entry.stations : [entry.exercise]) {
        n += 1
        lines.push(
          `${indent}${n}. key=${e.key} — ${e.name}, ${e.sets}x${repRangeLabel(e)}, rest ${e.restSec}s${circuitNote(e)}${capNote(e)}`,
        )
      }
    }
  }
  // Someone who doesn't train a flexibility skill has no use for the routines.
  const routines = stretchRoutinesFor(profile)
  if (routines.length === 0) {
    if (logsStretchOnly(profile)) {
      lines.push('', 'STRETCHING: tracked as a count of sessions a week, logged by hand; there is no guided stretch routine.')
    }
    return lines.join('\n')
  }
  // The sit-up it is told apart from is the owner's push day; no one else's
  // plan has it.
  const apart = owner
    ? ', which is a different movement from the incline weighted sit-up the push day trains and keeps its own history and its own weight'
    : ' and keeps its own history and its own weight'
  lines.push(
    '',
    planEdits
      ? 'CURRENT STRETCH ROUTINES (use routine key + block label + stretch key with update_flex_routine):'
      : 'CURRENT STRETCH ROUTINES:',
    `${routines.length > 1 ? 'These are the flexibility skills this person trains; whichever was done last, the app offers another next.' : 'This is the one flexibility skill this person trains.'} Each ends with the same four sets of key=${STRETCH_CORE.key} — ${STRETCH_CORE.name}, done flat on the mat${apart}. The second stretch of a day skips them, because the first one already did them.`,
  )
  for (const r of routines) {
    lines.push('', `routine=${r} — the ${FLEX_ROUTINES[r].label} routine:`)
    for (const b of flexPlans[r] ?? []) {
      lines.push(`${b.label}:`)
      for (const e of b.exercises) {
        // A hold is seconds spent in the pose, not repetitions of anything, and a
        // per-side stretch is done one leg at a time — both change what a set of
        // it even is, so both are said outright rather than left to be inferred
        // from a rep count of 1.
        const work = e.holdSec
          ? `${e.holdSec}s hold`
          : `${e.reps} reps${e.tempo ? `, ${e.tempo}` : ''}`
        const sides = e.perSide
          ? `, one side at a time (${e.sideSwitchSec ?? 5}s to switch legs${e.restAfterSides ? ', and the rest comes after both sides' : ''})`
          : ''
        const variations = e.setLabels?.length
          ? `, its sets are variations rather than rounds: ${e.setLabels.join(' / ')}`
          : ''
        lines.push(
          `  key=${e.key} — ${e.name}, ${e.sets}x${work}, rest ${e.restSec}s${sides}${variations}`,
        )
      }
    }
  }
  return lines.join('\n')
}

/** A question the auto-fixer left on an issue, waiting on a reply here. */
type AnswerTarget = { number: number; title: string; question: string }

/** One of the on/off switches sitting above the thread. */
function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      // Flipping a switch mid-sentence shouldn't cost you the keyboard: the
      // press would otherwise pull focus out of the composer and drop it, and
      // you'd have to tap back in to carry on typing.
      onMouseDown={(e) => e.preventDefault()}
      aria-pressed={on}
      className={`min-h-[44px] rounded-xl px-2 text-sm font-medium active:opacity-80 ${
        on ? 'bg-accent text-on-accent' : 'bg-surface text-neutral-300'
      }`}
    >
      {children}
    </button>
  )
}

export function ChatTab({
  answering,
  onAnsweringDone,
}: {
  /**
   * An issue number to answer, set when you tap an asking issue in Settings.
   * The coach chat is where the answer gets typed: the fixer's question arrived
   * without you, so this is the one place in the app already built to hold a
   * back-and-forth about the app itself.
   */
  answering?: number | null
  /** Called once the question is answered or dismissed, so it isn't re-opened. */
  onAnsweringDone?: () => void
}) {
  const {
    workouts,
    bodyWeights,
    streaks,
    settings,
    updateSettings,
    cardioEntries,
    plan,
    updatePlan,
    flexPlans,
    updateFlexPlan,
    flagDiscomfort,
  } = useData()
  // Only a kept thread comes back: with the toggle off, what's on screen has to
  // match what the coach was given, which is nothing yet.
  const [turns, setTurnsState] = useState<Turn[]>(() => {
    if (!session.keepContext) session.turns = []
    return session.turns
  })
  const setTurns = (next: Turn[]) => {
    session.turns = next
    setTurnsState(next)
  }
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  // A reload would cut off an answer that is still arriving.
  useEffect(() => (loading ? holdUpdates() : undefined), [loading])
  // The reply as it streams in, before it becomes a turn.
  const [pending, setPending] = useState('')
  // Off by default: each message starts a fresh conversation, so an answer is
  // never coloured by whatever was asked before it. Once it's on it stays on
  // until it is tapped off, tab switches, workouts and reloads included.
  const [keepContext, setKeepContext] = useState(session.keepContext)
  const toggleKeepContext = () => {
    session.keepContext = !keepContext
    setKeepContext(!keepContext)
    keepSwitches()
  }
  // Which tool sets this conversation gets. Same deal as the toggle above: the
  // choice is the session's, not this mount's.
  const [skills, setSkillsState] = useState(session.skills)
  const toggleSkill = (name: keyof CoachSkills) => {
    session.skills = { ...session.skills, [name]: !session.skills[name] }
    setSkillsState(session.skills)
    keepSwitches()
  }
  // The model is a setting rather than the session's: it is what the key gets
  // billed for, so the pick should still be there tomorrow.
  const models = modelChoices(settings)
  const pickModel = (model: string) => {
    updateSettings({ ...settings, openAiModel: model, coachModelPicked: true })
  }
  const endRef = useRef<HTMLDivElement>(null)
  // Answering an issue takes over the composer: what you type goes to the fixer
  // as a comment, not to the model. Null means the tab is a normal chat.
  const [answerTarget, setAnswerTarget] = useState<AnswerTarget | null>(null)
  const [answerLoading, setAnswerLoading] = useState(false)
  const [answerError, setAnswerError] = useState('')

  // Pull the question itself only when one is actually being answered — the list
  // in Settings knows an issue is asking, but not what it asked.
  useEffect(() => {
    setAnswerError('')
    if (answering == null) {
      setAnswerTarget(null)
      return
    }
    let alive = true
    setAnswerLoading(true)
    fetchIssueThread(answering)
      .then((thread) => {
        if (!alive) return
        setAnswerTarget({
          number: thread.number,
          title: thread.title,
          question: latestQuestion(thread),
        })
      })
      .catch(
        (e) =>
          alive && setAnswerError(e instanceof Error ? e.message : 'could not read that issue.'),
      )
      .finally(() => alive && setAnswerLoading(false))
    return () => {
      alive = false
    }
  }, [answering])

  const dismissAnswer = () => {
    setAnswerTarget(null)
    setAnswerError('')
    onAnsweringDone?.()
  }

  /** Send the typed text to the fixer as an issue comment rather than to the model. */
  const sendAnswer = async (target: AnswerTarget, text: string) => {
    setLoading(true)
    setAnswerError('')
    try {
      await answerIssue(target.number, text)
      setInput('')
      setTurns([
        ...turns,
        { role: 'user', content: text },
        { role: 'system', content: `answered #${target.number} — ${target.title}` },
      ])
      setAnswerTarget(null)
      onAnsweringDone?.()
      // The label just moved off `needs-input`; re-read so the nav dot clears
      // now instead of at the next poll.
      refreshIssues()
    } catch (e) {
      // Leave the target and the typed text in place so it can just be re-sent.
      setAnswerError(e instanceof Error ? e.message : 'could not send that answer.')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Commit or discard a proposed edit. The proposal carries the whole resulting
   * plan (or, for a discomfort flag, the finished note), so approving is a
   * straight save of that snapshot — no replaying edits against a plan that may
   * have moved on since.
   */
  const resolveProposal = (index: number, approve: boolean) => {
    const turn = turns[index]
    const proposal = turn?.proposal
    if (!proposal || proposal.status !== 'pending') return
    if (approve) {
      if (proposal.kind === 'plan') updatePlan(proposal.next)
      else if (proposal.kind === 'flex') {
        // The proposal carries every routine, so approving saves each one that
        // actually moved — a single reply can propose changes to both.
        for (const r of FLEX_ROUTINE_KEYS) {
          if (proposal.next[r] !== flexPlans[r]) updateFlexPlan(r, proposal.next[r])
        }
      }
      else void flagDiscomfort(proposal.edit)
    }
    const next = [...turns]
    next[index] = { ...turn, proposal: { ...proposal, status: approve ? 'approved' : 'rejected' } }
    setTurns(next)
  }

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [turns, pending, loading])

  // The keyboard shrinks the thread from the bottom, a little each frame while
  // the shell follows it up. Hold the tail against the composer the whole way
  // rather than scrolling to where it was when the animation began.
  const keyboardOpen = useKeyboardOpen()
  useEffect(() => {
    if (!keyboardOpen) return
    const until = performance.now() + 350
    let frame = requestAnimationFrame(function pin(now) {
      endRef.current?.scrollIntoView()
      if (now < until) frame = requestAnimationFrame(pin)
    })
    return () => cancelAnimationFrame(frame)
  }, [keyboardOpen])

  // Two ways to be able to send (see services/coach): the dev proxy holds an
  // Only the owner's reports become GitHub issues; anyone else's are feedback.
  const owner = ownerFlavour(settings.profile)
  // Epic key locally, or a key of your own goes straight to its service.
  const hasKey = import.meta.env.DEV || settings.openAiKey.trim().length > 0
  // While the composer is on screen the keyboard slides over the page rather
  // than resizing it, where the browser can do that (see overlayKeyboard).
  useEffect(() => (hasKey ? overlayKeyboard() : undefined), [hasKey])

  // `preset` is a starter question tapped on an empty thread, sent as typed.
  const starters = coachStarters(settings.profile)

  const send = async (preset?: string) => {
    const text = (preset ?? input).trim()
    if (!text || loading) return
    // Typing ahead of a question that's still loading is an answer, not a
    // message to the coach — hold it rather than sending it to the model.
    if (answerLoading) return
    if (answerTarget) return sendAnswer(answerTarget, text)

    // Without "keep context" the thread starts over on every send, so what's on
    // screen is exactly what the coach was given.
    const priorTurns = keepContext ? turns : []
    const base: Turn[] = [...priorTurns, { role: 'user', content: text }]
    setTurns(base)
    setInput('')
    setPending('')
    setLoading(true)

    // Build the raw message history (system context + visible turns + new user).
    const messages: RawMessage[] = [
      {
        role: 'system',
        content: buildSystemPrompt({
          today: new Date(),
          plan,
          workouts,
          bodyWeights,
          streaks,
          skills,
          profile: settings.profile,
          cardio: cardioEntries,
          cardioPlan: settings.cardioPlan,
          heightIn: settings.heightIn,
        }),
      },
      {
        role: 'system',
        content: planSnapshot(plan, flexPlans, skills.planEdits, settings.profile),
      },
      ...priorTurns
        .filter((t) => t.role !== 'system')
        .map((t) => ({ role: t.role, content: t.content }) as RawMessage),
      { role: 'user', content: text },
    ]

    // A switched-off tool set isn't offered at all, so the coach can't reach for
    // it — the prompt tells it what's missing and which button turns it back on.
    const tools: Tool[] = [
      ...(skills.planEdits ? [UPDATE_PLAN_TOOL, UPDATE_FLEX_TOOL] : []),
      FLAG_DISCOMFORT_TOOL,
      ...(skills.issues ? [owner ? REPORT_ISSUE_TOOL : SEND_FEEDBACK_TOOL] : []),
    ]

    let workingPlan = plan
    let workingFlex = flexPlans
    const newTurns: Turn[] = []
    const show = () => setTurns([...base, ...newTurns])
    try {
      // Tool loop: let the model call a tool, apply it, feed results back.
      for (let i = 0; i < 4; i++) {
        const turn = await coachTurn(settings, messages, { tools, onText: setPending })
        messages.push(turn.message)

        // Settle the streamed text into a turn, then clear the live buffer — the
        // two must swap in the same commit or the reply flickers.
        if (turn.content) newTurns.push({ role: 'assistant', content: turn.content })
        show()
        setPending('')

        if (turn.toolCalls.length === 0) break

        for (const call of turn.toolCalls) {
          let resultMsg = ''
          try {
            if (call.name === 'update_plan') {
              const parsed = JSON.parse(call.arguments) as { edits: PlanEdit[] }
              const res = applyPlanEdits(workingPlan, parsed.edits ?? [])
              // Chain the preview so a second edit in the same reply builds on the
              // first, but write nothing — the snapshot goes to the user instead.
              workingPlan = res.plan
              if (res.applied.length) {
                newTurns.push({
                  role: 'system',
                  content: 'the coach wants to change your workout plan',
                  proposal: { kind: 'plan', next: res.plan, changes: res.applied, status: 'pending' },
                })
              }
              resultMsg = JSON.stringify({
                status: 'awaiting_approval',
                proposed: res.applied,
                errors: res.errors,
                note: 'Nothing has been saved. The user must tap approve. Tell them what you proposed and that it is waiting on them.',
              })
            } else if (call.name === 'update_flex_routine') {
              const parsed = JSON.parse(call.arguments) as { edits: FlexEdit[] }
              const res = applyFlexPlanEdits(workingFlex, parsed.edits ?? [])
              workingFlex = res.plans
              if (res.applied.length) {
                newTurns.push({
                  role: 'system',
                  content: 'the coach wants to change your stretch routine',
                  proposal: { kind: 'flex', next: res.plans, changes: res.applied, status: 'pending' },
                })
              }
              resultMsg = JSON.stringify({
                status: 'awaiting_approval',
                proposed: res.applied,
                errors: res.errors,
                note: 'Nothing has been saved. The user must tap approve. Tell them what you proposed and that it is waiting on them.',
              })
            } else if (call.name === 'flag_discomfort') {
              const parsed = JSON.parse(call.arguments) as {
                exercise: string
                spots?: string[]
                date?: string
              }
              const asked = parsed.spots ?? []
              const spots = knownSpots(asked)
              // The coach names the movement and (sometimes) the day; which
              // session that is, is ours to resolve — asking a model for a
              // session id it has never been shown only invites an invented one.
              const found = lastSessionWith(workouts, parsed.exercise, parsed.date)
              const edit = found && discomfortEdit(workouts, found.session, parsed.exercise, spots)
              if (asked.length > 0 && spots.length === 0) {
                // Every spot it named was one the app doesn't count. Saying so
                // beats writing the empty list it narrowed down to, which would
                // clear the exercise's flags instead of adding one.
                resultMsg = JSON.stringify({
                  error: `not spots this app records: ${asked.join(', ')}`,
                  spots: DISCOMFORT_SPOTS,
                })
              } else if (!found || !edit) {
                resultMsg = JSON.stringify({
                  error: parsed.date
                    ? `no ${parsed.exercise} logged on ${parsed.date}`
                    : `no ${parsed.exercise} logged yet`,
                })
              } else {
                const name = exerciseName(parsed.exercise)
                const when = fmtSessionDate(found.date)
                const change = spots.length
                  ? `note ${spots.join(', ')} discomfort on ${name} — ${when}`
                  : `clear the discomfort noted on ${name} — ${when}`
                newTurns.push({
                  role: 'system',
                  content: 'the coach wants to note how that felt',
                  proposal: { kind: 'discomfort', edit, changes: [change], status: 'pending' },
                })
                resultMsg = JSON.stringify({
                  status: 'awaiting_approval',
                  proposed: [change],
                  note: 'Nothing has been saved. The user must tap approve. Tell them what you proposed and that it is waiting on them.',
                })
              }
            } else if (call.name === 'report_issue' || call.name === 'send_feedback') {
              const parsed = JSON.parse(call.arguments) as {
                title: string
                body?: string
                area?: IssueArea
              }
              // Attach the recent conversation so the report carries its own context.
              const chatTail = base
                .filter((t) => t.role !== 'system')
                .slice(-6)
                .map((t) => `${t.role}: ${t.content}`)
                .join('\n')
              // Decided by who is asking, not by which tool the model named:
              // only the owner's reports go to GitHub.
              try {
                if (owner) {
                  const issue = await reportIssue(parsed, chatTail)
                  newTurns.push({ role: 'system', content: `filed #${issue.number} — ${parsed.title}` })
                  resultMsg = JSON.stringify({ filed: true, number: issue.number, url: issue.url })
                } else {
                  await api.postFeedback(coachFeedbackMessage(parsed, chatTail), APP_COMMIT)
                  newTurns.push({ role: 'system', content: `sent feedback — ${parsed.title}` })
                  resultMsg = JSON.stringify({ sent: true })
                }
              } catch (e) {
                // The coach tells the user; this tells the laptop, with the report itself.
                void reportFilingFailure(
                  owner ? 'report_issue' : 'send_feedback',
                  e instanceof Error ? e.message : String(e),
                  parsed,
                )
                throw e
              }
            } else {
              resultMsg = JSON.stringify({ error: `unknown tool ${call.name}` })
            }
          } catch (e) {
            resultMsg = JSON.stringify({ error: e instanceof Error ? e.message : 'bad arguments' })
          }
          messages.push({ role: 'tool', tool_call_id: call.id, content: resultMsg })
        }
        // Show what the tools did while the coach works on what to say about it.
        show()
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'something went wrong.'
      setTurns([...base, ...newTurns, { role: 'assistant', content: msg, error: true }])
    } finally {
      setPending('')
      setLoading(false)
    }
  }

  // Without a key the coach is any chat AI you already have, by copy and paste.
  if (!hasKey) {
    return (
      <div className="flex flex-col gap-3 pb-24 pt-2">
        <h2 className="text-xl font-bold">coach with your AI</h2>
        <LiveCompanion />
      </div>
    )
  }

  return (
    /* A screenful plus the scroller's own bottom padding, then pulled back by the
       same amount: the tab reaches the very bottom of the screen without adding
       anything to scroll. This is half of what puts the composer on the bottom
       edge — it gives the bar room to reach, since a sticky box is held inside
       its containing block. The other half is the bar's own -bottom-4 (see
       below), which is what actually sends it down there. */
    <div className="-mb-4 flex min-h-[calc(100%+1rem)] flex-col">
      {/* Equal columns rather than a right-aligned row: the three switches are
          the same kind of thing, so they split the width evenly and each one
          sits where it always sits. */}
      <div className="grid grid-cols-3 gap-2 pb-2">
        <Toggle on={skills.planEdits} onClick={() => toggleSkill('planEdits')}>
          edit plan
        </Toggle>
        <Toggle on={keepContext} onClick={toggleKeepContext}>
          keep context
        </Toggle>
        <Toggle on={skills.issues} onClick={() => toggleSkill('issues')}>
          {reportToggleLabel(owner)}
        </Toggle>
      </div>
      {models.length > 1 && (
        <select
          aria-label="model"
          value={modelFor(settings)}
          onChange={(e) => pickModel(e.target.value)}
          disabled={loading}
          className="mb-2 min-h-[44px] rounded-xl bg-surface px-3 text-sm text-neutral-300 focus:outline-none focus:ring-2 focus:ring-accent"
        >
          {models.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      )}

      {/* pb-5 matches the scroller's own top padding (see AppShell's main), so
          the thread ends the same distance above the composer as it starts below
          the top of the screen. It wants no more than that: the composer is an
          ordinary sticky sibling at the end of the column, so once you're
          scrolled to the bottom it's sitting in its own space rather than over
          the thread, and every pixel of tail here is blank screen holding the
          conversation up off the input. */}
      <div className="flex flex-1 flex-col gap-3 pb-5">
        {/* An empty thread offers somewhere to start, sat just above the box the
            questions would otherwise be typed into. They go with the first turn. */}
        {turns.length === 0 && !loading && !answerTarget && (
          <div className="mt-auto flex flex-col items-end gap-2">
            {starters.map((q) => (
              <button
                key={q}
                onClick={() => void send(q)}
                className="min-h-[44px] rounded-2xl bg-surface px-4 text-left text-sm text-neutral-300 active:opacity-70"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {turns.map((t, i) =>
          t.proposal ? (
            <ProposalCard
              key={i}
              className="mx-auto w-full max-w-[85%]"
              title={t.content}
              changes={t.proposal.changes}
              status={t.proposal.status}
              onApprove={() => resolveProposal(i, true)}
              onReject={() => resolveProposal(i, false)}
            />
          ) : t.role === 'system' ? (
            <div key={i} className="mx-auto rounded-full bg-accent-2/15 px-3 py-1 text-xs text-accent-2">
              <MdBuild className="inline align-text-bottom mr-1" aria-hidden />
              {t.content}
            </div>
          ) : (
            <div key={i} className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  t.role === 'user'
                    ? 'whitespace-pre-wrap bg-accent-dark text-white'
                    : t.error
                      ? 'whitespace-pre-wrap bg-surface text-red-400'
                      : 'bg-surface text-neutral-100'
                }`}
              >
                {/* Only the coach's own replies are Markdown. What the user typed
                    is shown exactly as typed, and an error is a bare sentence. */}
                {t.role === 'assistant' && !t.error ? <Markdown text={t.content} /> : t.content}
              </div>
            </div>
          ),
        )}

        {/* The reply lands here as it streams; "…" holds the spot until the
            first token, and again while a tool call is being worked out. */}
        {loading && (
          <div className="flex justify-start">
            <div
              className={`max-w-[85%] rounded-2xl bg-surface px-3 py-2 text-sm ${
                pending ? 'text-neutral-100' : 'text-neutral-400'
              }`}
            >
              {/* Rendered as it streams, so the reply doesn't reflow the moment
                  it settles into a turn. */}
              {pending ? <Markdown text={pending} /> : '…'}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Frosted glass, so the tail of the thread dissolves behind the input
          instead of stopping at a hard edge.

          -bottom-4, not bottom-0, and it is the same 1rem the row above cancels
          with its margin: a sticky box comes to rest against the *content* box
          of the scroller, so AppShell's pb-4 on main parks this bar a padding's
          width short of the bottom no matter how far its parent reaches. The
          negative margin up there only fixes where the parent ends; sticky
          doesn't measure itself against the parent, it measures against the
          scrollport, so the same 1rem has to come off again here.

          The padding is the same 0.5rem on all four sides, so the field is
          framed evenly: the bar's own border is the line above it, and the
          0.5rem below holds whether or not the nav is standing under it. The
          bar is full-bleed, so this is deliberately tighter than the 1rem the
          thread above it is inset by — the field reaches nearer the edge than
          the messages do. */}
      <div className="sticky -bottom-4 -mx-4 flex flex-col gap-2 border-t border-border bg-bg/80 p-2 backdrop-blur-md">
        {/* The question rides above the composer rather than sitting in the
            thread: it has to stay on screen while the answer is being typed. */}
        {(answerLoading || answerTarget || answerError) && (
          <div className="rounded-xl border border-accent/40 bg-surface px-3 py-2">
            <div className="flex items-start gap-2">
              <MdHelpOutline className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 flex-1 text-xs text-accent">
                {answerTarget
                  ? `#${answerTarget.number} asks — ${answerTarget.title}`
                  : answerLoading
                    ? 'loading the question…'
                    : `#${answering}`}
              </span>
              <button
                onClick={dismissAnswer}
                aria-label="stop answering"
                className="-my-1 -mr-1 shrink-0 p-1 text-neutral-400 active:opacity-70"
              >
                <MdClose aria-hidden />
              </button>
            </div>
            {answerTarget?.question && (
              <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm text-neutral-100">
                {answerTarget.question}
              </p>
            )}
            {answerError && <p className="mt-1 text-sm text-red-400">{answerError}</p>}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send()
            }}
            // Start making room the moment the field is reached for. A tap as
            // well as a focus: the back button puts the keyboard away without
            // blurring the field, and the next tap brings it back unannounced.
            onFocus={expectKeyboard}
            onClick={expectKeyboard}
            aria-label={answerTarget ? `answer #${answerTarget.number}` : 'message'}
            /* Ghost text only when the field is aimed somewhere other than the
               coach: answering an issue is the one case where an empty box is
               ambiguous. Plain chat gets none — the tab it lives on already
               says what typing here does. */
            placeholder={answerTarget ? `answer #${answerTarget.number}` : undefined}
            /* The grey ring is the same 2px the focus ring is, so it only
               changes color when the field is aimed at: a ring paints outside
               the box, so without one to begin with the field's visible edge
               used to jump 2px outward on focus and the gap to the screen
               tightened with it. Now the outline holds still and only the
               color moves.

               px-2, matching the bar's own 0.5rem: the text starts the same
               distance in from the field's edge as the field sits from the
               bar's, so the inset reads as one measure all the way out. */
            className="min-h-[44px] flex-1 rounded-xl bg-surface px-2 text-base ring-2 ring-border focus:outline-none focus:ring-accent"
          />
          <button
            onClick={() => void send()}
            disabled={loading || answerLoading || input.trim().length === 0}
            aria-label={answerTarget ? 'reply' : 'send'}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-on-accent active:opacity-80 disabled:opacity-40"
          >
            <MdArrowForward className="text-xl" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  )
}
