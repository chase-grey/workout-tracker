# Workout Tracker — working notes

A mobile-first PWA used in a gym, one-handed, with a barbell or a stretch mat in
the way. See [README.md](./README.md) for stack and deploy, [BACKEND.md](./BACKEND.md)
for the Apps Script backend.

## Advancing a session is a tap anywhere

Both guided flows — the lift workout (`src/features/today/ActiveSession.tsx`) and
the stretch routine (`src/features/flex/StretchSession.tsx`) — obey one rule:

- **Advancing is a tap anywhere on the screen, never a button.** Your hands are
  busy and a button is a small target. Both sessions put the handler on the root
  element (`onScreenTap`) and ignore taps that land on `button, input, label, a`.
- **A set that runs on a clock ends itself.** A prescribed hold or a paced set
  rolls into its own rest on target (`HoldTimer.onTargetEnd`,
  `RhythmGuide.onTargetHit`); a stretch hold is additionally exempt from the
  screen tap so a stray one can't cut ninety seconds short. A lift hold is not
  exempt — it logs overtime, so it waits on you.
- **Only a terminal, data-committing action gets a button.** `finish workout`,
  `finish & log session`, the recap's dismissal, a photo screen's
  `continue`/`skip`. Ending and logging a session is not something a stray tap
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

## Testing

`npm test` is pure logic (`src/lib/*.test.ts`) — there are no component or flow
tests yet, which is why the divergence above had nothing to fail against. Logic
worth trusting belongs in `src/lib` with a test beside it rather than inline in a
1000-line session component.

## UI copy

No explanatory subtext, hint captions, or "how to use this" sentences under
controls. A clear label is enough. In particular: do not caption a tappable
screen with "tap anywhere to advance" — the flow teaches it in one set.
