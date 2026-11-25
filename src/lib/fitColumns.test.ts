import { expect, it } from 'vitest'
import { cardOnScreen, deckRules, layoutsFor, pickLayout, type Layout } from './fitColumns'

// The rules under "A desktop window" in CLAUDE.md, which are my-brain's. Sizes are px with the app's 15px rem.
const rem = 15
const ultrawide = 3330 // what is left of a 3438px window beside the rail and the gutters
const laptop = 1100
const measured = (layouts: Layout[], height: (layout: Layout) => number) => layouts.map((layout) => ({ ...layout, height: height(layout) }))

it('offers one column on any window and never a card narrower than the smallest', () => {
  expect(layoutsFor(300, rem, 6).map((layout) => layout.cols)).toEqual([1])
  for (const layout of layoutsFor(ultrawide, rem, 12)) expect(cardOnScreen(layout, rem) / layout.zoom).toBeGreaterThanOrEqual(deckRules.minCard * rem - 2)
})

it('never offers more columns than there are cards', () => {
  expect(layoutsFor(ultrawide, rem, 2).map((layout) => layout.cols)).toEqual([1, 2])
})

it('never zooms out, and never past the largest zoom', () => {
  for (const layout of [...layoutsFor(ultrawide, rem, 12), ...layoutsFor(laptop, rem, 12)]) {
    expect(layout.zoom).toBeGreaterThanOrEqual(1)
    expect(layout.zoom).toBeLessThanOrEqual(deckRules.maxZoom)
  }
})

it('stacks a few short cards into fewer, larger columns when the window has the height', () => {
  const layouts = layoutsFor(ultrawide, rem, 6)
  const picked = pickLayout(measured(layouts, () => 400), 1150, rem)
  expect(picked.zoom).toBe(deckRules.maxZoom)
  expect(picked.cols).toBeLessThan(layouts.length)
  expect(cardOnScreen(picked, rem)).toBeGreaterThanOrEqual(deckRules.comfortable * rem)
  // Not one lonely column either: as many as stay comfortable.
  expect(picked.cols).toBeGreaterThan(1)
})

it('spreads into more columns when the stacked cards would run past the window', () => {
  const layouts = layoutsFor(ultrawide, rem, 8)
  const stacked = pickLayout(measured(layouts, () => 400), 1150, rem)
  const crowded = pickLayout(measured(layouts, (layout) => 5000 / layout.cols * layout.zoom), 1150, rem)
  expect(crowded.cols).toBeGreaterThan(stacked.cols)
})

it('still picks large cards when one card is taller than the window, since the page scrolls either way', () => {
  // The hook measures each column count zoomed and, when that is too tall, again without the zoom.
  const layouts = layoutsFor(ultrawide, rem, 4).flatMap((layout) => [layout, { ...layout, zoom: 1 }])
  const picked = pickLayout(measured(layouts, (layout) => 3000 * layout.zoom), 1150, rem)
  expect(picked.zoom).toBe(1)
  expect(picked.cols).toBeGreaterThan(1)
})
