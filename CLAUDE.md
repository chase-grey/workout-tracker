# Workout Tracker — working notes

A mobile-first PWA used in a gym, one-handed, with a barbell or a stretch mat in
the way. See [README.md](./README.md) for stack and deploy, [BACKEND.md](./BACKEND.md)
for the Apps Script backend.

## Advancing a session is a tap on the blank space

Both guided flows — the lift workout (`src/features/today/ActiveSession.tsx`) and
the stretch routine (`src/features/flex/StretchSession.tsx`) — obey one rule:

- **Advancing is a tap on the blank space under the set, not a button.** Your
  hands are busy and a button is a small target. Chase's ruling (2026-11-25):
  the header (the name, the set and reps line) and the cards, with the gaps
  around and between them, never advance — a tap up there is a reach for a
  field or a control, not a set finished. Both sessions put the handler
  (`useScreenTap`) on a tap zone, the element that fills whatever the cards
  leave of the screen, never on the root. A stretch hold or paced set has
  nothing to edit, so its guide is the zone, from under the header down.
- **Cards that fill the screen get a `done` button.** When the zone is left
  with less than a target's worth of height (`useTapZone`, `tapZoneCramped`), a
  full round of a circuit or a card above the keyboard, the session shows
  `done` under the cards, doing what the tap does. It goes when the space
  comes back. `npm run shots -- session lift` taps the header and the card and
  fails the run's notes if the set moves, and draws the button.
- **A set that runs on a clock ends itself.** A prescribed hold or a paced set
  rolls into its own rest on target (`HoldTimer.onTargetEnd`,
  `RhythmGuide.onTargetHit`); a stretch hold additionally takes a double tap
  (`lib/holdTap`) so a stray one can't cut ninety seconds short — the first
  only marks the screen. A lift hold takes the single tap — it logs overtime,
  so it waits on you.
- **Only a terminal, data-committing action gets a button.** `finish workout`,
  `finish & log session`, the recap's dismissal, a photo's
  `save photo`/`don't save`/`skip`. Ending and logging a session is not something a stray tap
  should do.
- **An overlay that owns the screen swallows the tap.** Rest, the
  get-into-position count, the pause curtain, sheets. Each session gates its tap
  handler on a single "nothing between you and the set" flag (`setScreenLive` /
  `setLive`), and anything that floats over a tappable screen — the kebab's
  dismiss backdrop, the header's own controls — stops its own clicks.
- **A menu closes with the screen it was opened on.** The kebab's menu answers
  Android back by closing, like a sheet, and closes when its screen is covered
  or set aside (`components/KebabMenu`). Each session draws its header on the
  set, the rest and the count, and stays mounted while minimized, so anything
  else in that header that holds open state needs the same two things.

A button pressed straight out of a weight/reps field must use
`lib/usePressAction`: the press blurs the input, the keyboard closes, the page
reflows, and the browser's `click` never hit-tests back onto the button.

## The two sessions must move together

`ActiveSession.tsx` and `StretchSession.tsx` are parallel implementations of the
same flow — each has its own `topBar`, `menuItems`, `atLast`,
`completeSetAndAdvance`, and its own rest / get-ready / pause / checklist wiring.
Nothing but leaf components is shared, so **a change to session flow that lands
in one and not the other compiles clean and ships a divergence.** That is exactly
how the tap-to-advance rule spent three weeks applying to stretches only
(`b1c58a3`, 2026-08-05).

So: any change to how a session is paced, advanced, rested, or ended goes into
**both** files, or the commit body says why it belongs to only one. When touching
either file, check the other before you finish.

## A new exercise never starts without you

Chase's ruling (2026-11-25, after the hip thrust came up on its own): the way
into a new exercise either comes off a rest, the way a lift's does, or holds on
`ready?` until a tap. A count that runs out and leaves the exercise on screen
is not asking.

- In the pelvic tilt routine every new exercise holds on `ready?`
  (`lib/settleIn.settleInWaitsForTap`), the typed-in hip thrust included. A set
  whose card waits for its own tap is not an exception: the card appearing is
  the exercise starting.
- Side switches keep their count and later sets their rest: you're already set
  up.
- Head to toe waits only at the sciatic floss, and the side split and skill
  routines nowhere; they still count into each new exercise. Whether they wait
  too is Chase's call, not yet made.
- **`ready?` is never asked after a tap that got you there** (Chase,
  2026-11-25, at the RKC plank and the lunge stretch). A rest waits for a tap,
  so the tap that ends it is the answer; so is the tap through a preview and
  the tap on a checklist row. What follows any of them is the count. `ready?`
  is left for the crossings nothing was tapped at: a set that ended on its own
  clock, and a rest hands-free rolled out (`lib/settleIn.holdsOnReady`). The
  tap that ends a set is not such a tap: it says the set is over, not that
  you're in position for the next.
- **A set on a clock never starts on a tap** (same day). The hand that tapped
  has to get back under you, so a tap that leads into a hold, an open hold or
  a paced set starts the five-second count, and the count starts the set
  (`settleInTapStartsCount`; hands-free too). In the lift workout the same
  count stands between a tap and a hold's clock: a rest tapped away, the
  opening hold's start, a checklist row (`countingIn` in `ActiveSession`). A
  typed-in set has no clock, and its tap puts the card up.
- `settleIn.test.ts` lists the exercises that wait and holds both rules, and
  `npm run shots -- session pelvic` walks the routine from the tilts to the
  lunge stretch and notes any `ready?` after a tapped rest, or a tap with no
  count after it. `-- session lift-hold` draws the lift's count.

## A side switch counts what its exercise says

The count between the two sides of a stretch is the exercise's own
`sideSwitchSec` (five when it has none), never a flat number in the session
(2026-11-25: the routines said ten and the session served five). The estimates
read the same field (`lib/stretchSplit`, `lib/remainingTiming`). Anyone can
change it per exercise in Settings, under stretching, `seconds to switch sides`
(`settings/SideSwitchSetting`); it is kept with the routine on that device, and
restoring a routine's default puts the shipped seconds back.

**Every stretch ships with five**, and a longer one is written into a routine
only when Chase asks for it by name. He asked for ten on the rectus femoris
stretch; making the session honour the field gave ten to the floss, the lunge
stretch and the front split's three as well, which he had not asked for
(same day). `flexRoutines.test.ts` lists the stretches that ship with more
than five and fails on a new one.

## A set that is logged shows its past attempts

Any set a session writes as workout rows wears the trend button
(`MdShowChart`, opening `ExerciseHistorySheet`) beside the title, in both
sessions (2026-11-25). In the lift session that is every set, one per station
on a round screen. In the stretch session it is whatever
`flexSteps.loggedExerciseOf(step)` names: the typed-in sets (the hip thrust,
the sit-ups) and an open hold (the RKC plank), and never a paced stretch, which
logs nothing. A new kind of step that logs sets joins `loggedExerciseOf`;
`flexRoutines.test.ts` walks every shipped routine and fails if one is missed.

## What a session's clock counts

A session is measured against time in several places: the mark on the progress
bar, the checklist's "so far" and each exercise's "took", the rest tally, and
the length that gets logged. They all read one clock, and Chase has ruled on
what it leaves out (2026-11-24):

- **Paused time is off the clock**, in both sessions.
- **Photo screens are off the clock** (the stretch routine's camera, handles
  and save prompt).
- **The wait on "ready?" is off the clock** (2026-11-25): the stretch routine's
  count that holds until you tap (`GetReady`'s `untilTap`). The count that runs
  after the tap is back on it.
- Everything else counts: sets, rests, the get-into-position count, a sheet
  left open, the minutes before the first set.

The time off the clock is one tally per session (`lib/offClock`), saved with
it, and a session that went away paused comes back paused. So:

- **Never measure a session as `Date.now() - startedAt`.** Read
  `sessionElapsedSec(start, now, offClock)`.
- **A new screen that stops the session** steps off the clock when it opens
  and back on when it closes, the way the pause and the photo screen do, and
  takes its seconds out of the set clock (`setClock.skipSpan`) and out of a
  rest running behind it.
- **Whether a new kind of time counts is Chase's call.** Ask; don't decide it
  in a commit message.

## Left and right wear the same animation

A per-side round is two steps and one set, and its two sides show **the same
animation**. Variety comes between rounds, never between sides. This holds for
every animation a set wears, in both sessions:

- **A component never picks its own shape.** `RhythmGuide` and `HoldTimer`
  take `variant` as a required prop. The session draws it from a selector
  built on `lib/roundVariant` (`createRhythmVariantSelector`,
  `createHoldVariantSelector`), keyed by the **round**, not the step:
  `flexRoundKey(step)` for a stretch, `sidedRoundKey(inPlay, key, setIndex)`
  for a lift. Never key a draw by `stepKey`, which differs by side.
- **A new animated component, or a new family of shapes, joins the same way**:
  a rotation in the component's module, a selector from
  `createRoundVariantSelector`, a required `variant` prop, and
  `onVariantChange` wired to the selector's `keep` so a shape hidden from the
  kebab on one side is the swap the other side shows too.
- Rest is not a side of anything: its shape rotates every rest, including the
  reposition between two sides.

`lib/roundVariant.test.ts` walks every shipped stretch routine and lift day and
fails if a left step and its right step would ask under different keys.

## Which side goes first follows the movement

A one-side-at-a-time movement leads with whichever side did not lead it the
last time it was trained, **whatever day or routine that was**. The turn
belongs to the movement, never to the day: the lateral raise is on push and on
full body, and a turn kept per day led it left, left, right, right
(Chase, 2026-11-25).

- Lifts: `lib/pushSide.nextStartSides` reads each pair off the last session
  that logged it and the session pins the answer per exercise key
  (`WorkoutSession.startSides`). Two pairs on one day each keep their own turn.
- Stretches keep one turn per routine (`lib/stretchSide`), which is the same
  rule only while no per-side stretch is in two routines. Putting one in a
  second routine means giving it its own turn first.
- `pushSide.test.ts` runs the real push, pull, full-body week; a new sided
  movement or a new day that carries one is covered by it.

## A shape is empty when its screen closes

A rest or hold shape is handed `shapeFraction(remainingMs, totalMs)`
(`lib/shapeLead`), never the time left divided by the total. The shapes smooth
the clock's 250ms ticks with a 260ms transition, so one fed the bare fraction
runs a tick behind and the screen closes on it unfinished: the curvy sand
timer left a heap in its top bulb (2026-11-25). A countdown that closes itself
does so on the milliseconds reaching zero, not on the rounded seconds its
label shows, which get there half a second early. Only a shape redrawn every
frame with no transition (the comets) takes the clock as it is.

## An animation along the bottom follows the phone's own bottom

Chase's ruling (2026-11-25): anything drawn along the bottom edge of the screen
takes its shape from the phone it is on. Where the page reaches the glass (an
installed iPhone app, an Android page drawn behind the gesture pill) it curves
at that screen's corner radius. Where a navigation bar sits under the page, as
on Chase's Pixel, the corners are square and the line runs along the top of the
bar.

`lib/screenBottom` decides which, and `useBottomEdge()` hands a component the
`radius` and `lift` to draw with; the rest screen's perimeter is the one user
so far. Never write a corner radius into a component. No browser reports the
screen's radius, so iPhones come from a table by screen size and an Android
phone drawn edge to edge gets a share of its width, which is a guess. A screen
report says what a phone decided (`bottom:` in `npm run save-errors`).

## Changing something is a hold, never an edit button

Outside Settings and the forms a sheet opens, nothing on a page wears an
`edit` button. Holding it (`lib/useLongPress`, 450 ms) is how it's changed:

- **Today and Progress are stacks of cards** (`components/EditableStack`,
  `lib/cardLayout`). A hold anywhere folds the page to its cards by name: drag
  by the grip, × takes one off, the ones not showing wait underneath to be
  added. A card with settings of its own passes an `editor`, opened under its
  name — the calendar's schedule, the calorie buttons' amounts, the order of
  the week's goals, the tiles. The card that was held opens already.
- **A new card goes in the tab's `cards` list**, gated by pillar there, and
  `optional: true` if it shouldn't show until added. A new thing a card lets
  you customise is that card's `editor`, not a button on the card.
- **A list inside a card or a sheet takes its own hold** (the cardio kinds, a
  cardio plan's checkpoints). The innermost hold wins.
- **A hold never starts on a field or a chart**: a finger resting on a chart is
  reading it. `useChartReadout` opts its card out with `data-no-hold`; anything
  else that needs a resting finger does the same.
- The hold is invisible, so while control labels are on (`lib/controlLabels`,
  `editTiles`) the stack shows a labelled edit button that retires with use.
  That is the only one.

## A desktop window

Past 700px wide the app is in a desktop window, and it uses it (2026-11-25).
The ruling is the one Chase made for my-brain the same day (its AGENTS.md,
"monitors"), and the arithmetic is that app's, ported: `src/lib/fitColumns.ts`,
with the rules held by `fitColumns.test.ts`. The phone is untouched: none of
this applies at 700px and under.

- **The nav is a rail up the left side**, the same `BottomNav` restyled
  (`.has-rail` in index.css), not a second component.
- **A page of cards stands in columns**, sized from the window in both
  directions: with height to spare the cards are fewer columns and drawn
  larger, up to 1.35 times; columns are added, and the cards shrunk back, only
  when they would run past the bottom. No card is narrower than 24rem, a
  phone's width. Today, Progress and Settings are such pages.
- **A new page of cards joins by its markup**, never with a column count or a
  width cap of its own: `is-deck` on the tab's root, `deck` on the box whose
  children are the cards (`EditableStack` wears it already), and `deck-split`
  on a card whose blocks can stand apart, as the goals do.
- **A screen that is one thing to read** (the coach) keeps a 44rem measure in
  the middle.
- **A session keeps the phone's column.** The shell drops `has-rail` while one
  is on screen, because rest, the count and the pause are drawn over that same
  box (`lib/shell`). Making a session bigger in a window is Chase's call.
- **A sheet is a dialog in the middle of the window.** Every sheet is written
  `fixed inset-0 flex items-end`, and the stylesheet goes by that; write a new
  one the same way and it follows. A screen that takes the whole window
  (`fixed inset-0 flex flex-col bg-bg`) keeps its contents to the same 44rem.
- **Look at it in a window**: `npm run shots -- today progress --size 3438x1300`
  draws the same shots at that size (Chase's monitor), with a mouse instead of
  a thumb.

## Other people use this now

The app has more than one user. Each has a **profile** (`src/lib/profile.ts`,
saved in Settings and synced): the pillars they track (strength, flexibility,
cardio, diet), their weekly goals and calorie target as dated histories, and
which way the calorie target points. Their plan is a starter template
(`src/config/planTemplates.ts`) whose days are marked `custom`, so
`withPlanDefaults` never merges the shipped plan into it.

**A device with no profile is the owner's**, and so is a profile with
`owner: true` — `ownerFlavour(profile)` is the test. Everything written around
one person stays behind it: `DEFAULT_PLAN` and its revisions, the 180/190 lb,
bench-200 and six-pack goals, the bulk charts, `MEASUREMENT_HISTORY`, the core
block, the issue tooling. So:

- **A new constant that is really the owner's target is a bug for everyone
  else.** Weekly goals come from `weeklyGoalsFor` / `currentWeeklyGoals`, the
  calorie target from `calorieGoalOn`, the long-run goals from
  `lib/profileGoals.goalsFor` — all of which read the profile. Don't read
  `DEFAULT_WEEKLY_GOALS`, `CALORIE_GOALS` or `buildGoals` directly in UI code.
- **A goal of 0 is a pillar that's off**, not a goal that's met. Anything that
  averages, paces or celebrates weekly goals skips it (`lib/weekPace`,
  `lib/celebration`).
- **Gate a feature by pillar with `hasPillar(profile, …)`** and an owner-only
  one with `ownerFlavour(profile)`; pure lib code reads the same through
  `lib/profileStore`.
- **A `PLAN_REVISION` bump reaches only the owner.** A change every template
  should get goes in `planTemplates.ts`, and existing accounts keep the plan
  they have.
- **Requests carry an account key** (`lib/account`, `services/api`). A device
  that hasn't joined or signed in sends nothing at all; never add a fetch that
  bypasses `api.isConfigured()`.

## The owner hears of every new account

Chase's ruling (2026-11-25): anyone can make an account and it works right
away, and he is told in the app so he can decline it.

- Each new account is a notice under `new accounts` at the top of Settings'
  `owner` page (`features/settings/SignupsSection`), with `keep` and
  `decline`. While one waits the settings tab and the `owner` page wear the
  dot, and Settings opens on that page. Nobody but the owner is asked or shown
  anything (`lib/signups.shownSignups`).
- `decline` deletes the account and what it logged, so it takes the second
  tap every removal here does (`tap again to …`).
- A notice left alone goes by itself after 30 days and the account stays. The
  backend makes at most 5 accounts in any 24 hours. Both numbers are constants
  in `SimpleBackend.gs`; BACKEND.md "New accounts" has the rest.
- A new way of making an account leaves a notice too (`noteSignup`).
- `scripts/signupsBackend.test.mjs` and `lib/signups.test.ts` hold these, and
  `npm run shots -- settings accounts` draws them.

## Testing

`npm test` is pure logic (`src/lib/*.test.ts`) — there are no component or flow
tests yet, which is why the divergence above had nothing to fail against. Logic
worth trusting belongs in `src/lib` with a test beside it rather than inline in a
1000-line session component.

## Look before you report

A change to a rhythm figure, a hold or rest shape, a chart, or anything on
Today is not done until it has been looked at. Run `npm run shots -- <family>`
(`rhythm`, `hold`, `rest`, `today`, `progress`, `session`, `settings`; more words narrow it,
e.g. `-- rhythm anvil`; `--accent rose` or `--accent "#ff6600"` wears another colour) and open `.scratch/shots/index.html` or the
`sheet-*.png` beside it before reporting the change. It draws every figure and
shape at the moments that matter (a push, the rest, the white arriving, the
closing rep) in headless Edge and Firefox at 390x844, and opens the real app on
a seeded history for the rest. Charts want the owner's own history:
`npm run shots -- --refresh-data` snapshots it once, out of git, and later runs
reuse it; without a snapshot the history is made up, and the sheet says which.

The report says which browser the change was seen in, and that the phone was
not observed. Desktop Firefox is the phone's engine, not the phone. For what
the phone itself shows, ask for a screen report (`report screen` in a session's
menu, `report screen in 5s` in Settings, beside check for updates) and read it with
`npm run save-errors`.

## When the phone says it couldn't save

Don't ask for the error text. Run `npm run save-errors` first. Every write the
phone's outbox fails to deliver is reported, with its error, the build, and the
queued write itself, to the backend's `save_errors` tab
(`services/saveErrors.ts` → `SimpleBackend.gs appendSaveError`), and the
script reads it back. `-- --json` gives the whole payloads, enough to replay a
stuck write. The script also says when the backend doesn't answer at all, the
one failure a phone can't report. It exits 3 if the deployed backend predates
the route; that means `SimpleBackend.gs` needs redeploying (see BACKEND.md). It goes as the owner
with `CHAT_SHARED_SECRET` from `.env`, and exits 4 if the backend refuses it.

Before any of that, check the backend's version against the app's: `npm run
backend:check`. The app shows "Backend is behind" on Today and in Settings when
the deployed `SimpleBackend.gs` answers a lower version than the build needs,
and the Pages workflow's last job goes red for the same reason. Every change
to `SimpleBackend.gs` must be followed by `npm run backend:stamp` (the tests
fail otherwise) and `npm run deploy:backend`; see BACKEND.md "Versioning".

Then rule out a stale build: "I don't see X" on the phone usually means the
Pages deploy didn't land (`gh run list`), or a later commit from another
session reverted it (`git log -- <file>`).

## When the phone shows a blank screen

Same first move: `npm run save-errors -- --json`. The phone reports what it
can't show, to the same `save_errors` tab, under these routes:

- `crash`: a render threw (`components/CrashScreen`); stack and component stack.
- `blank_screen`: the tree was mounted and nothing was drawn, seen twice a
  moment apart after a back press, a load, or coming back to the app
  (`services/screenWatch`). Carries what was under fifteen points of the screen,
  what `AppShell` believed it was showing, and the back trail.
- `back_reload`: a load reached by going back, or a reopen within thirty
  seconds of a back press, which is what a blank screen the probe missed looks
  like from here.
- `boot_failed`: a load that never mounted anything. `index.html`'s watchdog
  keeps the errors it saw and the next load that starts sends them.
- `js_error`, `asset_error`: an uncaught error, or a script or stylesheet that
  didn't arrive.

The back trail (`lib/backTrail`) is the last forty events around the back
button: each pop and whether it was the app's own, each guard entry pushed or
dropped, each load with its navigation type, each hide and show, every one
stamped with `history.length` and the entry's guard id. Anything new that
touches `history` should `note()` what it did.

## When the keyboard and the composer fall out of step

The coach's composer rides the keyboard by one of three routes
(`src/lib/viewport.ts`): Chromium draws the keyboard over the page and the app
runs its own slide (`overlayKeyboard`, `--kb-cover`); a browser that resizes the
page gets a lift borrowed ahead of the resize (`expectKeyboard`, `--kb-lift`);
iOS gets the visual viewport mirrored (`--vvh`). Which one a phone takes, and
when its browser said what, cannot be seen from a desktop. The first keyboard
raised from the composer on each load is reported to `save_errors` as
`keyboard_trace`: the user agent, whether the keyboard was overlaid, and every
layout, visual-viewport and geometry change in the next second and a half with
its milliseconds since the tap. Read that (`npm run save-errors -- --json`)
before changing the timing or the route.

## The app updates itself only when nobody would notice

A new build is reloaded onto without asking only at a quiet moment
(`isQuietMoment` in `src/lib/version.ts`): off screen, just reopened and not yet
touched, or left alone for five minutes. Never during a workout, a stretch or a
recap, over an open sheet or a draft, or while the coach is answering; those
call `holdUpdates()`, and a new screen whose state a reload would lose must too.
Until the quiet moment comes, Settings wears its dot and the button reads
`update ready · restart`. The same pattern runs in my-brain and my-mail and is
written down in `~/.claude/patterns/app-update.md`; change the rule there too.

## UI copy

No explanatory subtext, hint captions, or "how to use this" sentences under
controls. A clear label is enough. In particular: do not caption a tappable
screen with "tap anywhere to advance" — the flow teaches it in one set.

## A line of facts wraps between facts, and only when it must

Chase, 2026-11-25, at "set" on one line and "2 of 2" on the next: text does
not wrap while there is room on the screen for it.

- **A session's set line sits under the header, never beside its controls.**
  Both sessions draw it as the header's next sibling, the whole width of the
  screen. Inside the header it has only the column left of the buttons, and
  wraps with the rest of the row empty.
- **Each fact on a " · " line is kept whole** with `lib/unbroken` ("set 2 of
  2", "rest 1.5 min", "left leg"), so a line that does have to wrap breaks at
  a dot.

## Signing in never writes first

A device signing in to an account that already exists reads the account before
it writes to it: `signInToAccount` for someone else's device, `signInAsOwner`
for one of the owner's. Neither calls `updateSettings`, which stamps the
device's copy as newest and pushes it whole. That push is how a browser that had
only been opened replaced the account's commitments with none on 2026-11-25.
`updateSettings` at sign-in is only for making an account (`claimOwner`,
`register`), where there is nothing up there to lose.

## What my-brain reads

my-brain's body slice is this app's weekly streak and committed goals.
`store/useBrainShare.ts` posts a summary to the backend's `share` route, which
my-brain reads on any device with the account's key, and leaves the same summary
under the `wt.share.body` storage key for a my-brain on the same device (both
apps are served from `chase-grey.github.io`). my-brain's side is
`src/domain/bodyTracker.ts` in that repo. The summary carries results, never
rules: change how a week or a goal is judged here and my-brain follows. It names
every reached goal and every committed one, and my-brain links back to the
Progress tab with `?tab=progress` (`lib/resumeTab.ts`). Renaming
the key or the route, or reshaping `BrainShare` in `lib/brainShare.ts` breaks that slice, so
change both repos together.
