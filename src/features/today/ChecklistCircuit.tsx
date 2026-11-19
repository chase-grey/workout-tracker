import { useState } from 'react'
import { MdBlock, MdCheckCircle, MdDragIndicator, MdKeyboardArrowDown, MdRadioButtonUnchecked } from 'react-icons/md'
import type { PlannedExercise } from '../../config/plan'
import type { ExerciseLog, SetLog } from '../../types'
import { circuitMembers, circuitRounds, circuitTitle, roundsLabel, roundTally } from '../../lib/circuitEntry'
import { DRAG_LEFT, DRAG_LIFTED, DRAG_ONTO, type CombineHandleProps } from '../../lib/useDragCombine'
import { sidesAgree } from '../../lib/sidePair'
import { inPlayRounds, setPosition } from '../../lib/skipped'
import { formatDuration } from '../../lib/estimate'
import { clockText } from '../../lib/setClock'
import { toWeight } from '../../lib/weightField'
import { ControlWord } from '../../components/ControlWord'

/**
 * The checklist's drag, as it applies to this row (see lib/useDragCombine): the
 * whole circuit is carried by its own grip, and each movement by its grip — a
 * movement let go outside the circuit leaves it. Movements are named by the key
 * of the station that leads them.
 */
export type CircuitDrag = {
  row: (el: HTMLElement | null) => void
  /** The heading, which is what's carried when the whole circuit is dragged. */
  head: (el: HTMLElement | null) => void
  handle: CombineHandleProps
  lifted: boolean
  /** A drop would add what's being dragged to this circuit. */
  onto: boolean
  part: (lead: string) => (el: HTMLElement | null) => void
  partHandle: (lead: string) => CombineHandleProps
  partLifted: (lead: string) => boolean
}

type Props = {
  drag: CircuitDrag
  stations: PlannedExercise[]
  logFor: (key: string) => ExerciseLog | undefined
  /** The step on screen, as `key:setIndex`. */
  currentStepKey: string
  skipped: boolean
  canSkip: boolean
  complete: boolean
  timeLeftSec: number
  /** What the finished circuit took and what it was priced at. */
  took?: { spentSec: number; projectedSec: number }
  onJump: () => void
  onToggleSkip: () => void
  onToggleComplete: () => void
  onJumpRound: (round: number) => void
  onSkipRound: (round: number, skip: boolean) => void
  canSkipRound: (round: number) => boolean
  onRoundDone: (round: number, done: boolean) => void
  onEdit: (key: string, round: number, patch: Pick<SetLog, 'weightLbs'> | Pick<SetLog, 'reps'>) => void
  /** One-arm pairs split into a line per side on the set screen, by leading key. */
  apart: ReadonlySet<string>
  /** The skip mark's starter word, shared with every other skip in the checklist. */
  skipLabel: { show: boolean; word: string; used: () => void }
}

/**
 * A circuit in the workout checklist: one row for the whole block, the way the
 * day is actually done (see lib/circuitEntry), rather than a row per station.
 *
 * The row reads like an exercise's — what it is, how far through it you are,
 * the time left on it — and its block and check act on every station at once.
 * Under it, its movements a line each, every one with a grip to drag it out by.
 * It opens (already open when it's the circuit on screen) into its rounds, each
 * with every station's numbers in it, and a round is struck off, put back or
 * ticked as one: a round is what one tap logs.
 *
 * A one-arm pair is one line in a round, as it is one card on the set screen:
 * what's typed is both sides' number. It's a line a side when the two sides'
 * sets of the round differ, or when the set screen split them.
 */
export function ChecklistCircuit({
  drag,
  stations,
  logFor,
  currentStepKey,
  skipped,
  canSkip,
  complete,
  timeLeftSec,
  took,
  onJump,
  onToggleSkip,
  onToggleComplete,
  onJumpRound,
  onSkipRound,
  canSkipRound,
  onRoundDone,
  onEdit,
  apart,
  skipLabel,
}: Props) {
  const keys = stations.map((e) => e.key)
  const onScreen = keys.includes(currentStepKey.slice(0, currentStepKey.lastIndexOf(':')))
  const [open, setOpen] = useState(onScreen)
  const title = circuitTitle(stations)
  const sets = stations.map((e) => logFor(e.key)?.sets ?? [])
  const rounds = circuitRounds(stations.map((e, i) => sets[i].length || e.sets))
  const tally = roundTally(sets)
  const liveRounds = inPlayRounds(sets)
  const field =
    'min-h-[40px] w-full rounded-lg bg-surface-2 px-2 text-sm tabular-nums placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-30'

  return (
    <div
      ref={drag.row}
      className={`rounded-xl px-2 ${onScreen ? 'bg-surface-2' : ''} ${drag.onto ? DRAG_ONTO : ''}`}
    >
      <div ref={drag.head} className={`flex items-center gap-2 ${drag.lifted ? DRAG_LIFTED : ''}`}>
        <button
          {...drag.handle}
          aria-label={`move ${title}`}
          className="-ml-2 flex min-h-[44px] w-9 shrink-0 cursor-grab items-center justify-center text-2xl text-neutral-600 active:cursor-grabbing"
        >
          <MdDragIndicator aria-hidden />
        </button>
        <button
          onClick={onJump}
          className={`min-w-0 flex-1 py-3 text-left active:opacity-70 ${skipped ? 'opacity-50' : ''}`}
        >
          <span className="text-[10px] tracking-wide text-neutral-500">{roundsLabel(rounds)}</span>
          <span className={`block font-medium ${skipped ? 'line-through' : ''}`}>{title}</span>
          <span className="text-xs text-neutral-500 tabular-nums">
            {tally.done}/{tally.all} rounds
            {!skipped && timeLeftSec > 0 && ` · ${formatDuration(timeLeftSec).replace(/^~/, '')}`}
            {complete && took && took.spentSec > 0 &&
              ` · took ${clockText(took.spentSec)} · est ${clockText(took.projectedSec)}`}
          </span>
        </button>
        {!skipped && (
          <button
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={open ? `hide the rounds of ${title}` : `show the rounds of ${title}`}
            className="p-2 text-2xl text-neutral-500"
          >
            <MdKeyboardArrowDown className={open ? 'rotate-180' : ''} aria-hidden />
          </button>
        )}
        {(skipped || canSkip) && (
          <button
            onClick={() => {
              skipLabel.used()
              onToggleSkip()
            }}
            aria-label={skipped ? `unskip ${title}` : `skip ${title}`}
            className="flex items-center p-2 text-2xl text-neutral-500"
          >
            <MdBlock className={skipped ? 'text-neutral-200' : 'text-neutral-600'} aria-hidden />
            <ControlWord show={skipLabel.show} word={skipLabel.word} layout="inline" />
          </button>
        )}
        {!skipped && (
          <button
            onClick={onToggleComplete}
            aria-label={complete ? 'mark incomplete' : 'mark complete'}
            className="p-2 text-2xl"
          >
            {complete ? (
              <MdCheckCircle className="text-accent-2" aria-hidden />
            ) : (
              <MdRadioButtonUnchecked className="text-neutral-600" aria-hidden />
            )}
          </button>
        )}
      </div>

      <div className={`mb-1 flex flex-col ${skipped ? 'opacity-50' : ''} ${drag.lifted ? DRAG_LEFT : ''}`}>
        {circuitMembers(stations).map((m) => (
          <div
            key={m.keys[0]}
            ref={drag.part(m.keys[0])}
            className={`flex items-center rounded-lg ${drag.partLifted(m.keys[0]) ? DRAG_LIFTED : ''}`}
          >
            <button
              {...drag.partHandle(m.keys[0])}
              aria-label={`move ${m.name} out of ${title}`}
              className="flex min-h-[40px] w-9 shrink-0 cursor-grab items-center justify-center text-xl text-neutral-600 active:cursor-grabbing"
            >
              <MdDragIndicator aria-hidden />
            </button>
            <span className="min-w-0 flex-1 truncate text-sm text-neutral-300">{m.name}</span>
          </div>
        ))}
      </div>

      {open && !skipped && (
        <div className={`mb-2 flex flex-col gap-2 border-t border-neutral-200/10 pt-1 ${drag.lifted ? DRAG_LEFT : ''}`}>
          {Array.from({ length: rounds }, (_, r) => {
            const roundSets = sets.map((s) => s[r])
            const existing = roundSets.filter((s): s is SetLog => !!s)
            const inPlay = existing.filter((s) => !s.skipped)
            const roundSkipped = existing.length > 0 && inPlay.length === 0
            const roundDone = inPlay.length > 0 && inPlay.every((s) => s.done)
            const here = keys.some((k) => currentStepKey === `${k}:${r}`)
            return (
              <div key={r} className={`flex flex-col gap-1 rounded-lg px-1 ${here ? 'bg-surface-2/60' : ''}`}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => (roundSkipped ? onSkipRound(r, false) : onJumpRound(r))}
                    className={`min-h-[40px] flex-1 text-left text-xs text-neutral-500 active:opacity-70 ${roundSkipped ? 'line-through opacity-50' : ''}`}
                  >
                    {/* Numbered as the round screen numbers it; a skipped round
                        keeps the number it was written with. */}
                    round {roundSkipped ? r + 1 : setPosition(liveRounds, r).number}
                  </button>
                  {/* The same mark a set has: not on a round already logged, nor
                      on the last one left in play. */}
                  <button
                    onClick={() => {
                      skipLabel.used()
                      onSkipRound(r, !roundSkipped)
                    }}
                    disabled={!roundSkipped && (roundDone || !canSkipRound(r))}
                    aria-label={roundSkipped ? `unskip round ${r + 1}` : `skip round ${r + 1}`}
                    className="flex items-center p-1 text-xl text-neutral-500 disabled:invisible"
                  >
                    <MdBlock className={roundSkipped ? 'text-neutral-200' : 'text-neutral-600'} aria-hidden />
                    <ControlWord show={skipLabel.show} word={skipLabel.word} layout="inline" />
                  </button>
                  <button
                    onClick={() => onRoundDone(r, !roundDone)}
                    disabled={roundSkipped}
                    aria-label={roundDone ? `mark round ${r + 1} incomplete` : `mark round ${r + 1} complete`}
                    className="p-1 text-xl disabled:invisible"
                  >
                    {roundDone ? (
                      <MdCheckCircle className="text-accent-2" aria-hidden />
                    ) : (
                      <MdRadioButtonUnchecked className="text-neutral-600" aria-hidden />
                    )}
                  </button>
                </div>
                {!roundSkipped &&
                  circuitMembers(stations).flatMap((m) => {
                    const at = m.keys.map((k) => roundSets[keys.indexOf(k)])
                    const [a, b] = at
                    const one =
                      m.keys.length === 2 &&
                      !apart.has(m.keys[0]) &&
                      sidesAgree(a, b) &&
                      !!a?.done === !!b?.done &&
                      !!a?.skipped === !!b?.skipped
                    if (one && a) {
                      return [
                        <StationFields
                          key={m.keys[0]}
                          name={m.name}
                          exercise={m.stations[0]}
                          set={a}
                          round={r}
                          field={field}
                          onEdit={(patch) => {
                            for (const k of m.keys) onEdit(k, r, patch)
                          }}
                        />,
                      ]
                    }
                    return m.stations.map((e, i) => {
                      const set = at[i]
                      if (!set) return null
                      return (
                        <StationFields
                          key={e.key}
                          name={e.name}
                          exercise={e}
                          set={set}
                          round={r}
                          field={field}
                          onEdit={(patch) => onEdit(e.key, r, patch)}
                        />
                      )
                    })
                  })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * One station's numbers for one round. A set not yet done holds its prefilled
 * target (see lib/checklistEdit): shown as the prompt it is, not as a number
 * logged, and typing over it logs it.
 */
function StationFields({
  name,
  exercise,
  set,
  round,
  field,
  onEdit,
}: {
  name: string
  exercise: PlannedExercise
  set: SetLog
  round: number
  field: string
  onEdit: (patch: Pick<SetLog, 'weightLbs'> | Pick<SetLog, 'reps'>) => void
}) {
  const isDone = !!set.done
  const off = !!set.skipped
  const weightHint = set.weightLbs != null ? String(set.weightLbs) : exercise.bodyweight ? 'bw' : ''
  return (
    <div className={`flex items-center gap-2 ${off ? 'opacity-50' : ''}`}>
      <span className={`w-24 shrink-0 truncate text-xs text-neutral-400 ${off ? 'line-through' : ''}`}>{name}</span>
      {!exercise.repsOnly && (
        <label className="flex min-w-0 flex-1 items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            aria-label={`${name} round ${round + 1} weight`}
            value={isDone ? set.weightLbs ?? '' : ''}
            placeholder={isDone ? '' : weightHint}
            onChange={(event) => onEdit({ weightLbs: toWeight(event.target.value) })}
            disabled={off}
            className={field}
          />
          <span className="text-xs text-neutral-500">lb</span>
        </label>
      )}
      <label className="flex min-w-0 flex-1 items-center gap-1">
        <input
          type="number"
          inputMode="numeric"
          min="0"
          aria-label={`${name} round ${round + 1} ${exercise.timed ? 'seconds' : 'reps'}`}
          value={isDone ? set.reps || '' : ''}
          placeholder={isDone ? '' : String(set.reps || '')}
          onChange={(event) => onEdit({ reps: Number(event.target.value) || 0 })}
          disabled={off}
          className={field}
        />
        <span className="text-xs text-neutral-500">{exercise.timed ? 'sec' : 'reps'}</span>
      </label>
    </div>
  )
}
