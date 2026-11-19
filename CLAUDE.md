# Workout Tracker — working notes

A mobile-first PWA used in a gym, one-handed, with a barbell or a stretch mat in
the way. See [README.md](./README.md) for stack and deploy, [BACKEND.md](./BACKEND.md)
for the Apps Script backend.

## Advancing a session is a tap anywhere

Both guided flows — the lift workout (`src/features/today/ActiveSession.tsx`) and
the stretch routine (`src/features/flex/StretchSession.tsx`) — obey one rule:

- **Advancing is a tap anywhere on the screen, never a button.** Your hands are
  busy and a button is a small target. Both sessions put the handler on the root
  element (`useScreenTap`) and ignore taps that land on `button, input, label, a`
  or inside a card spread with `TAP_SHIELD` — the set card with the weight and
  reps fields, where a tap is a reach for a field, not a set finished. The blank
  screen around the card is the target.
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

A button pressed straight out of a weight/reps field must use
`lib/usePressAction`: the press blurs the input, the keyboard closes, the page
reflows, and the browser's `click` never hit-tests back onto the button.

## The two sessions must move together

`ActiveSession.tsx` and `StretchSession.tsx` are parallel implementations of the
same flow — each has its own `topBar`, `menuItems`, `atLast`,
`completeSetAndAdvance`, and its own rest / get-ready / pause / checklist wiring.
Nothing but leaf components is shared, so **a change to session flow that lands
in one and not the other compiles clean and ships a divergence.** That is exactly
how the tap-anywhere rule spent three weeks applying to stretches only
(`b1c58a3`, 2026-08-05).

So: any change to how a session is paced, advanced, rested, or ended goes into
**both** files, or the commit body says why it belongs to only one. When touching
either file, check the other before you finish.

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

## Testing

`npm test` is pure logic (`src/lib/*.test.ts`) — there are no component or flow
tests yet, which is why the divergence above had nothing to fail against. Logic
worth trusting belongs in `src/lib` with a test beside it rather than inline in a
1000-line session component.

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

## UI copy

No explanatory subtext, hint captions, or "how to use this" sentences under
controls. A clear label is enough. In particular: do not caption a tappable
screen with "tap anywhere to advance" — the flow teaches it in one set.
