# Head-to-toe stretch routine — spec

A second flexibility routine, alongside the existing side-splits one. The two
alternate the way push and pull do: Today dims whichever was done last, so the
other reads as up next.

Status: **implemented.** Goal ladders for the two new angles are deliberately out
of scope — see [Deferred](#deferred). Where the build diverged from what is
written below, see [As built](#as-built).

## Contents

- [The routine](#the-routine)
- [Decisions already made](#decisions-already-made)
- [Data model](#data-model)
- [Angle direction — the new wrinkle](#angle-direction--the-new-wrinkle)
- [Routine registry](#routine-registry)
- [Alternation](#alternation)
- [Core, and when it is skipped](#core-and-when-it-is-skipped)
- [Session flow](#session-flow)
- [Measurement](#measurement)
- [Progress tab](#progress-tab)
- [Today tab](#today-tab)
- [Storage and backend](#storage-and-backend)
- [Chat tools](#chat-tools)
- [Deferred](#deferred)
- [File-by-file change list](#file-by-file-change-list)
- [Open questions](#open-questions)
- [As built](#as-built)

## The routine

Five exercises, in order. Every per-side exercise runs one side at a time, with
5 seconds to switch legs between them.

| | exercise | work | sets | sides | rest |
|---|---|---|---|---|---|
| A | rolling feet | 90s hold, ball under a bare foot | 1 | each | none |
| B | calf stretch | 90s hold | 3 (one per variation) | each | none |
| C | sciatic nerve floss | 8 reps · 3s up · 3s down | 3 | each | 60s, after both sides |
| D | pike block crush | 3 reps · 10s each | 1 | each | 60s, after both sides |
| E | pike lift | 5 reps · 5s contract down · 5s rest · 5s lift · 5s rest | 3 | each | 60s, after both sides |

B's three sets are three variations rather than three identical rounds: **straight
on**, **feet out**, **feet in**. Each variation is held 90s per side, so the calf
block is six holds — nine minutes of it.

Then the core block (weighted sit-ups, the same one the side-splits routine
appends), unless it was already done in an earlier stretch today.

### Set order

C, D and E rest only once both sides have finished the round:

```
L set 1  ─5s switch→  R set 1  ─60s rest→
L set 2  ─5s switch→  R set 2  ─60s rest→
L set 3  ─5s switch→  R set 3  ─60s rest→
```

A and B never rest at all — 5 seconds to switch sides, and for B, 5 seconds
between variations.

### Session length

Roughly 40 minutes with core, on the prescription above:

| block | work | rest | total |
|---|---|---|---|
| A rolling feet | 180s | — | 3:00 |
| B calf stretch | 540s | — | 9:00 |
| C nerve floss | 288s | 180s | 7:48 |
| D block crush | 60s | 60s | 2:00 |
| E pike lift | 600s | 180s | 13:00 |
| core | ~120s | 180s | ~5:00 |

That is about twice the side-splits routine. Worth knowing before it ships;
nothing in the design depends on shortening it, and the numbers above are exactly
what was asked for.

## Decisions already made

| question | answer |
|---|---|
| Names | `side split` and `head to toe` |
| Toe-touch angle | Raw hip angle — standing = 180°, folded flat = 0°. **Smaller is deeper.** |
| Measurement | Camera, same as the splits poses (MediaPipe landmarks + draggable handles) |
| Core skip trigger | Only core logged by an earlier *stretch* session today. Push/pull sit-ups don't suppress it. |
| Side order | Alternate each round (above) |
| Angle scope | Each routine measures only its own poses |
| Today layout | Two stretches on one row, the three lift days below |

## Data model

### `FlexRoutineKey`

```ts
export type FlexRoutineKey = 'side_split' | 'head_to_toe'
```

### `FlexExercise` — new fields

`src/config/flexPlan.ts`. All optional, so the existing side-splits data is
unchanged and every new field reads as "no" when absent.

```ts
  /** Done one side at a time: the flow generates a left step and a right step per set. */
  perSide?: boolean
  /** Seconds to hold, for a static hold rather than a rep-paced set. Mutually
   *  exclusive with `tempo` — a step with holdSec renders the HoldTimer. */
  holdSec?: number
  /** A name per set, when the sets are variations rather than rounds
   *  (calf stretch: straight on / feet out / feet in). Indexed by round. */
  setLabels?: string[]
  /** Seconds to switch legs between the two sides of a round. Default 5. */
  sideSwitchSec?: number
  /** The rest lands after both sides of a round, not after each side. */
  restAfterSides?: boolean
```

`holdSec` earns its place rather than being faked with a tempo string: a 90-second
static hold has nothing for `RhythmGuide` to animate, and `HoldTimer` already
does exactly this job for the plank — counts down, buzzes at the target, runs on
the wall clock, ends itself hands-free.

### `FlexSetStep` — new fields

`src/lib/flexSteps.ts`:

```ts
  side?: Side          // 'left' | 'right' — absent for a two-sided stretch
  setLabel?: string    // the variation's name, when the exercise has them
  holdSec?: number     // a timed hold; `tempo`/`reps` are unused when set
  sideSwitchSec?: number
```

The step's `stepKey` gains the side so the two sides of a round track done-ness
separately: `${bi}:${ex.key}:${round}:${side}`.

### `FlexEntry` — new fields

`src/lib/flex.ts`. Six new angle fields, plus the routine record:

```ts
  coldToeTouchDeg?: number | null
  warmToeTouchDeg?: number | null
  coldLegLiftLeftDeg?: number | null
  coldLegLiftRightDeg?: number | null
  warmLegLiftLeftDeg?: number | null
  warmLegLiftRightDeg?: number | null
  /** Routines completed on this date, in completion order. Absent on legacy
   *  entries, which were all side splits. */
  routines?: FlexRoutineKey[]
```

No untagged legacy variant of the new fields (unlike `splitDeg` /
`tailorsLeftDeg`) — nothing has ever written them, so cold and warm are the only
two readings that exist and the `??` fallback chains stay one link long.

**`routines` is an array, not a scalar, and this matters.** `dedupeFlexByDate`
collapses a date to one entry. Two stretch sessions in one day is not a corner
case here — it is precisely the case the core-skip rule exists for. A scalar
`routine` would have the second session overwrite the first, and the alternation
would then read a day that did both as having done only one. Merge rule in
`dedupeFlexByDate`: **union, preserving first-seen order**, appended in input
order (which is completion order).

## Angle direction — the new wrinkle

Toe touch is the first metric in the app where **lower is better**. Everything
that reads an angle today assumes bigger wins, usually by taking a `max`. That
assumption is currently spread across four modules; the fix is to name it once.

New module `src/lib/flexMetrics.ts`:

```ts
export type AngleDirection = 'higher' | 'lower'

/** Which way a metric improves, and the comparators that follow from it. */
export type MetricDir = {
  direction: AngleDirection
  /** The better of two readings. */
  best: (a: number, b: number) => number
  /** True when `a` is an improvement on `b`. */
  beats: (a: number, b: number) => boolean
  /** Signed progress from `from` to `to` — positive means improvement, so a
   *  delta reads the same way on every metric on screen. */
  gain: (from: number, to: number) => number
}
```

Callers to update, each of which currently hardcodes the higher-is-better form:

| file | what breaks without this |
|---|---|
| `lib/flex.ts` `metricStats` | `best` takes `v > best`; a toe-touch best would report the worst reading |
| `lib/flexCelebration.ts` `todayVsPrior` + PR check | announces a PR for the shallowest fold of the week |
| `lib/angleContext.ts` | `isBest`, `priorBest`, `delta` and the goal `toGo` all invert |
| progress chart framing | a descending series plots fine, but "up is good" padding does not |

Leg lift is ordinary — bigger is better. Only toe touch is inverted, which is
exactly why the direction belongs on the metric rather than in a branch at each
call site.

## Routine registry

New module `src/config/flexRoutines.ts` — one place that knows what a routine is:

```ts
export type FlexRoutine = {
  key: FlexRoutineKey
  label: string                 // 'side split' | 'head to toe'
  blocks: FlexBlock[]
  /** Shots offered on the cold screen at the top of the session. */
  coldShots: PhotoKind[]
  /** Shots offered on the warm screen after the last stretch set. */
  warmShots: PhotoKind[]
}

export const FLEX_ROUTINES: Record<FlexRoutineKey, FlexRoutine>
export const FLEX_ROUTINE_KEYS: FlexRoutineKey[] = ['side_split', 'head_to_toe']
```

`DEFAULT_FLEX_ROUTINE` in `config/flexPlan.ts` stays exactly as it is and becomes
`FLEX_ROUTINES.side_split.blocks`. Keeping the export means `services/storage.ts`
and `lib/flexTools.ts` keep compiling against the name they already use.

### Head-to-toe blocks

Each exercise gets its own block — nothing here is a superset, and the block
labels are what the session header and the checklist show.

```ts
{ label: 'feet', exercises: [{
    key: 'rolling_feet', name: 'rolling feet',
    sets: '1', maxSets: 1, reps: 1, tempo: '',
    holdSec: 90, perSide: true, restSec: 0,
}]},
{ label: 'calves', exercises: [{
    key: 'calf_stretch', name: 'calf stretch',
    sets: '3', maxSets: 3, reps: 1, tempo: '',
    holdSec: 90, perSide: true, restSec: 0,
    setLabels: ['straight on', 'feet out', 'feet in'],
}]},
{ label: 'nerve floss', exercises: [{
    key: 'sciatic_floss', name: 'sciatic nerve floss',
    sets: '3', maxSets: 3, reps: 8, tempo: '3s up · 3s down',
    perSide: true, restSec: 60, restAfterSides: true,
}]},
{ label: 'pike', exercises: [
  { key: 'pike_block_crush', name: 'pike block crush',
    sets: '1', maxSets: 1, reps: 3, tempo: '10s press down',
    perSide: true, restSec: 60, restAfterSides: true },
  { key: 'pike_lift', name: 'pike lift',
    sets: '3', maxSets: 3, reps: 5,
    tempo: '5s contract down · 5s rest · 5s lift · 5s rest',
    perSide: true, restSec: 60, restAfterSides: true },
]},
```

The tempo strings are chosen so `lib/tempo.ts` and `lib/rhythmMotion.ts` read them
correctly with no changes:

- `3s up · 3s down` — `up` matches `RISE`, `down` matches `DESCEND`, so *breathe*.
- `10s press down` — `press` and `down` match `DESCEND`, nothing rises, so
  *descent*, which is the right shape for pressing into a block.
- `5s contract down · 5s rest · 5s lift · 5s rest` — depths `1 → 0.3 → 0 → 0`,
  motion *breathe*. Reads as work, release, lift, release.

Verify these against `lib/tempo.test.ts` and `lib/rhythmMotion.test.ts` rather
than by eye — the regexes are word-boundary matches and a rename would silently
change the animation.

## Alternation

New module `src/lib/stretchRotation.ts`, modelled on `lib/pushVariant.ts` — read
off logged history rather than a stored toggle, so it survives a reinstall and
agrees across devices.

```ts
/** The routine most recently completed, or null with no stretch history. */
export function lastStretchRoutine(entries: FlexEntry[]): FlexRoutineKey | null

/** The routine up next — the other one; side_split with nothing on record. */
export function nextStretchRoutine(entries: FlexEntry[]): FlexRoutineKey
```

`lastStretchRoutine` walks to the newest-dated entry carrying a `routines` array
and takes its **last** element. A legacy entry with no `routines` counts as
`side_split` rather than being skipped — that is factually what those sessions
were, and it means the very first suggestion is head to toe, which is right, since
it has never been done.

Note the difference from `lastVariant`, which *skips* rows with no variant. There
the untagged rows were genuinely ambiguous; here they are not.

Measurement-only entries (`note: 'measurement'`) carry no `routines`, so they
never turn the alternation over.

## Core, and when it is skipped

New module `src/lib/stretchCore.ts`:

```ts
/** Whether an earlier stretch session today already logged core sets. */
export function coreDoneToday(workouts: WorkoutRow[], today: string): boolean
```

Implementation: any row today with `exercise === STRETCH_CORE.key` **and**
`notes === CORE_SESSION_NOTE`. `logCore` already stamps that note on every row it
writes, and nothing else does — so it identifies stretch-session core exactly, and
a push or pull day's programmed sit-ups are correctly ignored.

The decision is **pinned at session start** into `StretchState.core`, for the same
reason `WorkoutSession.variant` and `startSide` are pinned: a session resumed
after another one logged core must keep the shape it began with, or the checklist
and the step count would change under you mid-routine.

`buildSessionSteps` grows the flag:

```ts
export function buildSessionSteps(
  plan: FlexBlock[],
  opts?: { core?: boolean },   // default true
): SessionStep[]
```

Skipping core makes the **last stretch set** the closing step, which changes two
things in `StretchSession`:

- `atLast` now lands on a flex step, so the sticky "finish & log session" button
  has to render under a `RhythmGuide` or a `HoldTimer`, not just under the core
  fields.
- `onTargetHit` / `endsOnTarget` are currently suppressed on the last step
  (`!atLast`) because core owns the finish. With core skipped, the final stretch
  set should still end itself and then present the finish button rather than
  logging the session on a timer — a routine should not file itself away while you
  are still in the pose.

## Session flow

`StretchSession` gains a `routine: FlexRoutineKey` prop and reads its blocks, cold
shots and warm shots from `FLEX_ROUTINES`.

### Per-side steps

`buildFlexSteps` expands a `perSide` exercise into two steps per round. Within a
round, left leads, then right. Ordering across rounds follows the decision above:
alternate each round.

The header names the side and the variation:

```
calf stretch
set 2 of 3 · feet out · left
```

### Timed holds

A step with `holdSec` renders `HoldTimer` in place of `RhythmGuide`:

- `targetSec={step.holdSec}`
- `onTargetEnd` when running hands-free, so the routine rolls on by itself
- `onStop` otherwise — a hold you kept going on is worth keeping

Holds are **not** logged with their actual duration the way a plank is. A stretch
step is done or not done; there is no per-set history for it. Calling this out
explicitly rather than by omission: the hold's real length is interesting, but
nothing today stores per-flex-step data and adding that is a larger change than
this one.

### Side switch

Between the two sides of a round, `sideSwitchSec` (default 5) drives a `GetReady`
count rather than a `RestTimer`. It is a reposition, not a rest — so it must not be
banked into `restAccumSec`, or the session's rest tally would count the switches
and the time-left estimate would drift.

`advanceFrom` grows a third case alongside the existing two:

```
1. index is the last step            → finish
2. crossing flex → core              → no rest, get-ready count
3. crossing left → right of a round  → no rest, sideSwitchSec get-ready   ← new
   (when the exercise has restAfterSides)
4. otherwise                         → the step's own rest
```

For `restAfterSides` exercises the rest fires on the **right** step's completion.
For A and B, `restSec` is 0, so case 4 produces no rest at all and the flow needs
to hand straight to the next side's get-ready.

### Get-ready times

`GET_READY_SEC_BY_EX` gains entries — the pike positions take real setting up:

```ts
{ tailors_pose: 15, pike_block_crush: 15, pike_lift: 15, rolling_feet: 10 }
```

## Measurement

### Refactor `lib/measure.ts` first

Every function in `measure.ts` is written as `if (mode === 'split') { … } else { … }`:
`angleMarks`, `defaultHandles`, `handlesFromLandmarks`, `anglesFromHandles`,
`summarizeResult`. Going from two modes to five that way is where this change
would rot. Replace the branches with one spec table:

```ts
type ModeSpec = {
  label: string
  handles: HandleSpec[]
  segments: Segment[]
  verticalRef: string | null
  sidePair: [string, string] | null
  defaults: Handles
  fromLandmarks: (lms: Landmark[], mirrored: boolean) => Handles | null
  angles: (h: Handles, aspect: number) => MeasureResult
  marks: (h: Handles, r: MeasureResult) => AngleMark[]
  summarize: (r: MeasureResult) => string
}
const MODE: Record<MeasureMode, ModeSpec>
```

The existing `HANDLES`, `SEGMENTS`, `VERTICAL_REF`, `SIDE_PAIR` and `MEASURE_LABEL`
records become fields of it. Existing behaviour must not change —
`lib/measure.test.ts` is the guard, and it should pass untouched through the
refactor before any new mode is added.

### New modes

```ts
export type MeasureMode =
  | 'split' | 'tailors'
  | 'toe_touch' | 'leg_lift_left' | 'leg_lift_right'
```

**`toe_touch`** — side-on photo of a standing forward fold.

| | |
|---|---|
| handles | `shoulder`, `hip`, `ankle` |
| segments | hip→shoulder (`a`), hip→ankle (`b`) |
| vertical ref | none — both lines are body lines |
| landmarks | shoulder = mid of `LEFT_SHOULDER`/`RIGHT_SHOULDER`, hip = mid of hips, ankle = mid of ankles |
| angle | at the hip, between torso and legs |
| result | `toeTouchDeg` |
| sides | none |
| direction | **lower is deeper** |

**`leg_lift_left` / `leg_lift_right`** — front-on photo, standing, one leg raised.

| | |
|---|---|
| handles | `hip`, `ankleStand`, `ankleLift` |
| segments | hip→ankleStand (`ref`), hip→ankleLift (`a` for left, `b` for right) |
| vertical ref | none — the standing leg *is* the reference, which self-corrects for camera tilt in a way a plumb line does not |
| landmarks | hip = mid of hips; the lifted ankle is the mode's side, the standing ankle the other |
| angle | at the hip, between the two legs |
| result | `legLiftLeftDeg` or `legLiftRightDeg` |
| sides | none *within* a shot — the side is the mode |
| direction | higher is better |

A mode per side, rather than one `leg_lift` mode with a side flag, because you can
only lift one leg per photo. Two captures, each producing one field, keeps
`anglesFromHandles` and `summarizeResult` free of side branching — and the handle
labels ("standing ankle" / "lifted ankle") and the landmark mapping genuinely
differ per side.

`hasSides` is false for all three new modes, so `swapSides` and the editor's swap
control are correctly unavailable — there is no pair to trade.

`MeasureResult` gains `toeTouchDeg`, `legLiftLeftDeg`, `legLiftRightDeg`.

### Photo gates

`lib/photoSteps.ts`. `PhotoKind` gains six:

```
'cold-toe-touch'      'warm-toe-touch'
'cold-leg-lift-left'  'cold-leg-lift-right'
'warm-leg-lift-left'  'warm-leg-lift-right'
```

`PhotoGateId` gains `'cold-h2t'` and `'warm-h2t'` — distinct ids, so a day that
runs both routines does not have one routine's gate suppress the other's.

`COLD_GATE` becomes per-routine, read from `FLEX_ROUTINES[routine].coldShots`.
`gateAfterStep` becomes routine-aware: for head to toe there is a single warm gate
after the **last stretch set**, offering all three warm shots. Both pike exercises
warm the fold and the lift, so one gate at the end is the honest place for all
three, and it mirrors how the splits routine puts the warm split after its last
stretch set.

Three camera setups back to back is a lot in the middle of a session — but the
cadence is weekly, not per session (`lib/photoCadence.ts`), so most sessions see
no camera screen at all.

`photoCadence.CAPTURED` gains a reader per new kind.

### `MeasureSheet` is dead code

`src/features/flex/MeasureSheet.tsx` is not rendered anywhere — nothing imports
it. Do not extend it with the new angles. Either delete it in this change or leave
it strictly alone; do not half-update it, which would leave a file that looks
current and is not.

## Progress tab

`lib/flex.ts` gains series builders and stats, mirroring the existing pair:

```ts
export type ToeTouchPoint = { date: string; cold: number | null; warm: number | null }
export function toeTouchSeries(entries: FlexEntry[]): ToeTouchPoint[]

export type LegLiftPoint = {
  date: string
  coldLeft: number | null; coldRight: number | null
  warmLeft: number | null; warmRight: number | null
}
export function legLiftSeries(entries: FlexEntry[]): LegLiftPoint[]
```

`flexStats` gains `coldToeTouch`, `warmToeTouch`, `coldLegLiftLeft/Right` and
`legLiftLeft/Right` — and `metricStats` takes a `MetricDir` so `best` means
"lowest" for the fold.

### Where the charts live

**Not in `GoalsPanel`.** A `FlexLadderBlock` is only ever reached through
`ladders.find(l => l.rungs.some(...))` from a goal row — a ladder with zero rungs
never renders at all. Since the goal ladders are deliberately deferred, putting the
new charts there would put them nowhere.

So: a plain chart section in `ProgressTab`, below the lift charts, drawing
`toeTouchSeries` and `legLiftSeries` through `LadderChart` with `goals={[]}`.
`FlexLadderBlock` already tolerates empty rungs (`goalLines` comes out empty, the
rung rows map over nothing), so the block component can be reused as-is with
`rungs={[]}` and `ring=""` — it just needs a caller that is not goal-driven.

When the goal ladders land, these two blocks move into `GoalsPanel` alongside the
split and tailor's blocks and the `ProgressTab` section goes away.

Check `LadderChart`'s axis framing with `goals={[]}` — the existing two callers
always pass at least one goal line, so a no-goal domain is an untested path.

## Today tab

```
┌──────────────┐ ┌──────────────┐
│  side split  │ │ head to toe  │   ← one dimmed
└──────────────┘ └──────────────┘
┌──────────────┐ ┌──────────────┐
│     push     │ │     pull     │   ← one dimmed
└──────────────┘ └──────────────┘
┌──────────────┐
│  full body   │
└──────────────┘
```

Two grids rather than one five-cell flow, so each dimming pair sits side by side.
The stretch row dims `lastStretchRoutine(flexEntries)`; the lift row keeps its
existing `dimmedDay` logic untouched.

Dimming stays a hint — a dimmed button still starts its session, exactly as the
push/pull dimming does today.

`onStartStretch` gains the routine: `(routine: FlexRoutineKey) => void`.
`App.startStretch` seeds `StretchState` with `routine` and with
`core: !coreDoneToday(workouts, today)`.

## Storage and backend

### `services/storage.ts`

`wt.flexplan` currently holds one `FlexBlock[]`. Move to a per-routine map, seeding
`side_split` from the legacy key so no stored customisation is lost:

```ts
loadFlexPlans(): Record<FlexRoutineKey, FlexBlock[]>
saveFlexPlans(p: Record<FlexRoutineKey, FlexBlock[]>): void
```

Migration on read: if `wt.flexplans` is absent, build it from `wt.flexplan` (or
`DEFAULT_FLEX_ROUTINE`) for `side_split` and `FLEX_ROUTINES.head_to_toe.blocks` for
`head_to_toe`. Leave the old key in place — a rollback should not lose an edited
routine.

`StretchState` gains:

```ts
  /** Which routine is in progress. Absent on a session started before this
   *  shipped, which was necessarily a side split. */
  routine?: FlexRoutineKey
  /** Whether this session includes the core block, decided at start. */
  core?: boolean
```

`DataContext` grows `flexPlans` / `updateFlexPlan(routine, blocks)` in place of the
single `flexPlan` / `updateFlexPlan(blocks)`.

`logFlex` gains `routines?: FlexRoutineKey[]` on `FlexMeasurement`, threads the six
new angle fields, and adds them to `FLEX_ANGLE_KEYS` so a new-angle capture is
correctly recognised as a measurement rather than a completed session.

### `SimpleBackend.gs`

`FLEX_HEADERS` gains seven columns, appended so existing column indices are
untouched:

```
routines
cold_toe_touch_deg      warm_toe_touch_deg
cold_leg_lift_left_deg  cold_leg_lift_right_deg
warm_leg_lift_left_deg  warm_leg_lift_right_deg
```

`flexSheet()` already carries a two-step migration chain for this sheet; add a
third step that widens a 10-column sheet to 17. `routines` is stored as a
comma-joined string and split on read.

`keep(...)` merge semantics apply per column as they do today, so a date that runs
both routines and syncs twice ends up with both sets of readings. `routines` needs
a **union** merge rather than `keep`, matching `dedupeFlexByDate` — otherwise the
second sync overwrites the first routine off the row.

## Chat tools

`lib/flexTools.ts` edits "the side-splits stretch routine" and is now ambiguous.
Every `FlexEdit` gains a `routine: FlexRoutineKey` field, defaulting to
`side_split` when absent so any prompt or transcript already in flight still
resolves. `applyFlexEdits` takes the routine map rather than one array.

`lib/chatPrompt.ts` needs to describe both routines and the new fields (`perSide`,
`holdSec`, `setLabels`) so the coach can edit them, and to state the core-skip rule
so it does not describe a session that includes core when it will not.

## Deferred

- **Goal ladders for toe touch and leg lift.** Explicitly out of scope until the
  first real measurements are in and the gap is known. The direction plumbing
  (`AngleDirection`) is built now because PRs and the on-photo context card need it
  immediately; `GoalSpec` and `lib/goals.ts` are left alone. When rungs land,
  `GoalSpec` will need its own `direction` and `isReached` / projection will need to
  respect it — the fold's ladder descends.
- **Per-hold duration history.** Holds are done/not-done for now.
- **Weekly stretch goal.** Stays at 2 sessions/week (`flexStats.weeklyGoal`), which
  with alternation is one of each. `sessionsThisWeek` counts distinct *dates*, so a
  day that runs both routines still counts once — unchanged, and left unchanged.

## File-by-file change list

**New**

| file | purpose |
|---|---|
| `src/config/flexRoutines.ts` | the registry; head-to-toe blocks |
| `src/lib/flexMetrics.ts` | `AngleDirection`, per-metric comparators |
| `src/lib/stretchRotation.ts` | which routine is up next |
| `src/lib/stretchCore.ts` | `coreDoneToday` |
| a `.test.ts` beside each | |

**Changed**

| file | change |
|---|---|
| `src/config/flexPlan.ts` | `FlexExercise`: `perSide`, `holdSec`, `setLabels`, `sideSwitchSec`, `restAfterSides` |
| `src/lib/flex.ts` | 6 angle fields, `routines`, union merge in dedupe, new series + stats, direction-aware `metricStats` |
| `src/lib/flexSteps.ts` | per-side expansion, `setLabel`, `holdSec`, `{ core }` option |
| `src/lib/measure.ts` | **table-driven refactor**, then 3 new modes |
| `src/lib/photoSteps.ts` | 6 new `PhotoKind`, per-routine cold gate, routine-aware `gateAfterStep` |
| `src/lib/photoCadence.ts` | `CAPTURED` readers for the new kinds |
| `src/lib/angleContext.ts` | 3 new metrics, direction-aware best/delta/goal |
| `src/lib/flexCelebration.ts` | 3 new PR poses, direction-aware comparison |
| `src/lib/flexTools.ts` | `routine` on every edit |
| `src/lib/chatPrompt.ts` | describe both routines + new fields + core rule |
| `src/features/flex/StretchSession.tsx` | `routine` prop, side steps, `HoldTimer`, side-switch case, core-skipped finish |
| `src/features/flex/CameraMeasure.tsx` | handle labels / mode plumbing for 3 new modes |
| `src/features/flex/AngleEditor.tsx` | same |
| `src/features/today/TodayTab.tsx` | two grids, stretch dimming |
| `src/features/progress/ProgressTab.tsx` | the two new charts |
| `src/features/progress/FlexLadderBlock.tsx` | `Ladder` gains the two, goal-free rendering |
| `src/features/settings/SettingsTab.tsx` | restore-default per routine |
| `src/services/storage.ts` | `flexPlans` map + migration, `StretchState.routine`/`core` |
| `src/store/DataContext.tsx` | `flexPlans`, `updateFlexPlan(routine, …)`, new angle fields in `logFlex` |
| `src/App.tsx` | `startStretch(routine)`, pin core at start |
| `SimpleBackend.gs` | 7 columns, migration step 3, union merge for `routines` |

**Delete or leave alone**

- `src/features/flex/MeasureSheet.tsx` — dead code; do not half-update it.

### Suggested order

1. `measure.ts` table refactor, existing tests green and unchanged.
2. `flexMetrics.ts` + direction plumbed through `flex.ts`, `angleContext.ts` and
   `flexCelebration.ts`, still with only the existing metrics. Green.
3. Data model: `FlexEntry` fields, `routines` union merge, storage migration,
   backend columns. Green.
4. `flexRoutines.ts` + `flexPlan.ts` fields + `flexSteps.ts` expansion. Green.
5. New measure modes + photo gates.
6. `StretchSession` — side steps, holds, core skip.
7. `TodayTab` alternation, `ProgressTab` charts.
8. `flexTools` / `chatPrompt`.

Steps 1–4 are behaviour-preserving and independently verifiable, which is what
keeps a change this wide reviewable.

## Open questions

1. **Rolling feet — one 90s hold per foot, or a paced roll?** Specced as a static
   90s hold. If the intent is to keep the foot moving over the ball throughout, a
   paced version (`reps: 9, tempo: '10s roll'`) would give the screen a rhythm to
   follow instead of a bare countdown. Cheap to change either way.
2. **Pike block crush — is the 60s rest right for a single set?** One set of 3×10s
   per side is 60 seconds of work total, followed by 60 seconds of rest before the
   pike lift. Specced as asked; flagging it only because it is the one rest in the
   routine that is as long as the work it follows.
3. **Warm gate placement.** All three warm shots after the last pike lift set. The
   alternative is toe touch after the block crush and leg lift after the pike lift,
   splitting the camera work across two screens. Specced as one screen.

All three were built as specced. The rolling-feet hold and the block crush's rest
are what was asked for, and the three warm shots share one screen.

## As built

Four places where the implementation departs from the spec above, each because
the spec's own reasoning pointed past what it wrote.

**`COLD_GATE` became `coldGate(routine)`.** Spec: "`COLD_GATE` becomes
per-routine." A constant can't be, so it is a function. `photoSteps.test` was
updated accordingly — the only existing test this change had to touch.

**`applyFlexEdits` kept its signature; `applyFlexPlanEdits` was added beside it.**
Spec: "`applyFlexEdits` takes the routine map rather than one array." One edit can
only ever touch one routine, so the map-level job is purely routing — and widening
the engine's signature would have rewritten all thirty-odd assertions in
`flexTools.test` for no behavioural gain. The engine still takes one routine's
blocks; the new dispatcher sends each edit to the routine it names and tags every
message with which one it was, since a single chat reply can now propose changes
to both.

**`coreDoneToday` reads the note through `isSupplementalSet`, not `===`.** Spec:
"`notes === CORE_SESSION_NOTE`." A discomfort flag tapped mid-session appends to
that note (see `lib/discomfort.withDiscomfort`), so a literal compare would have
missed exactly the sets it was meant to find.

**`anglePRs` sorts by improvement, not by degrees.** The spec asked for
direction-aware comparison and left the "deepest first" sort alone, but raw
degrees stop being comparable the moment one metric counts down: a 96° fold and a
120° split can't be ranked against each other, and the fold would always have come
last. The headline now goes to the pose that moved furthest.

### Beyond the spec

**Per-routine session length (`SessionDuration.routine`).** Not in the file list,
but without it the feature ships a clock that lies. `remainingSecs` scales the
median of past *comparable* sessions, and comparable was `kind: 'stretch'` — which
pools a 40-minute routine with a 20-minute one and would have reported "~20 min
left" at the top of every head-to-toe session, forever, however many of them were
logged. The duration now carries which routine it was, `matching` filters on it,
and an untagged stretch counts as a side split so the split keeps every sample it
has ever had. One appended column on the durations tab, which `sheet()` widens by
itself.

**`stepWorkSec` reads the tempo.** The structural fallback priced every rep at a
flat five seconds. The tempos actually prescribed run from six seconds a rep to
twenty — a pike lift set is five reps of twenty — so the first-ever session's
estimate came out at little over half the real length. It now sums the tempo's own
phases, falling back to the flat assumption when there is nothing to parse.
