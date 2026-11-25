import { useLayoutEffect, type RefObject } from 'react'

/**
 * How a page of cards uses a desktop window (CLAUDE.md, "A desktop window").
 * The ruling and the arithmetic are my-brain's (`src/fitColumns.ts` there):
 * cards are drawn as large as the window allows and stacked into as few columns
 * as that takes; columns are added, and the cards shrunk back, only when the
 * cards would otherwise run past the bottom of the window.
 *
 * The markup it reads: a tab's root wears `is-deck`, and the box inside it whose
 * children are the cards wears `deck` (components/EditableStack, Settings'
 * groups). A card made of blocks that can stand apart wears `deck-split`, and
 * its blocks are laid out as cards of their own. The CSS that turns the three
 * custom properties into columns is in index.css beside the rail.
 */

/** Sizes in rem at zoom 1, except `comfortable`, which is what a card measures on screen. */
export const deckRules = { minCard: 24, maxCard: 34, comfortable: 36, gap: 1, maxZoom: 1.35 }

/** The window is a desktop's from here up: the line the shell's phone layout stops at (index.css). */
export const DESKTOP = '(min-width: 701px)'

export type Layout = { cols: number; zoom: number; /** The deck's width in px before zoom. */ width: number }

const round = (value: number) => Math.round(value * 100) / 100

/** The largest layout for each column count: zoomed as far as it goes, with cards no wider than `maxCard`. */
export function layoutsFor(areaPx: number, remPx: number, items: number): Layout[] {
  const { minCard, maxCard, gap, maxZoom } = deckRules
  const layouts: Layout[] = []
  for (let cols = 1; cols <= Math.max(1, items); cols += 1) {
    const narrowest = (cols * minCard + (cols - 1) * gap) * remPx
    if (cols > 1 && areaPx < narrowest) break
    const zoom = round(Math.min(maxZoom, Math.max(1, areaPx / narrowest)))
    layouts.push({ cols, zoom, width: Math.floor(Math.min(areaPx / zoom, (cols * maxCard + (cols - 1) * gap) * remPx)) })
  }
  return layouts
}

/** How wide one card is on screen, in px. */
export function cardOnScreen(layout: Layout, remPx: number): number {
  return ((layout.width - (layout.cols - 1) * deckRules.gap * remPx) / layout.cols) * layout.zoom
}

/**
 * Picks from layouts already measured. Among those that fit the window: the
 * biggest cards, and once cards are comfortable, the most columns. When nothing
 * fits (one card taller than the window, say) the page scrolls whatever is
 * picked, so the same choice is made among the layouts within a tenth of the
 * shortest page.
 */
export function pickLayout(measured: Array<Layout & { height: number }>, availablePx: number, remPx: number): Layout {
  const limit = Math.max(availablePx, Math.min(...measured.map((layout) => layout.height)) * 1.1)
  const fitting = measured.filter((layout) => layout.height <= limit)
  const size = (layout: Layout) => Math.min(cardOnScreen(layout, remPx), deckRules.comfortable * remPx)
  return fitting.reduce((best, layout) => {
    const gain = size(layout) - size(best)
    return gain > 1 || (gain >= -1 && layout.cols > best.cols) ? layout : best
  })
}

/** What is laid out as one card: a stack's card, a split card's blocks, anything else put straight in the deck. */
const CARDS = ':scope > :not(:has(> .deck-split)), :scope > [data-card] > .deck-split > *'
const PROPS = ['--deck-zoom', '--deck-cols', '--deck-width'] as const

function apply(content: HTMLElement, layout: Layout | undefined) {
  const values = layout ? [String(layout.zoom), String(layout.cols), `${layout.width}px`] : []
  PROPS.forEach((name, i) => {
    if (layout) content.style.setProperty(name, values[i])
    else content.style.removeProperty(name)
  })
}

function fit(main: HTMLElement) {
  const content = main.querySelector<HTMLElement>('.is-deck')
  if (!content) return
  const deck = content.querySelector<HTMLElement>('.deck')
  // A page being arranged is a list of names, one card wide (see EditableStack).
  if (!deck || !matchMedia(DESKTOP).matches) return apply(content, undefined)
  const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const mainStyle = getComputedStyle(main)
  const areaPx = main.clientWidth - parseFloat(mainStyle.paddingLeft) - parseFloat(mainStyle.paddingRight)
  const availablePx = main.clientHeight - parseFloat(mainStyle.paddingTop) - parseFloat(mainStyle.paddingBottom)
  const cards = [...deck.querySelectorAll<HTMLElement>(CARDS)].filter((card) => card.getBoundingClientRect().height > 0)
  if (cards.length === 0 || areaPx <= 0) return apply(content, undefined)
  const measure = (layout: Layout) => {
    apply(content, layout)
    // Balancing can leave the last columns empty, which would sit the cards off centre; such a layout is skipped.
    const used = new Set(cards.map((card) => Math.round(card.getBoundingClientRect().left))).size
    return { ...layout, used, height: content.getBoundingClientRect().height }
  }
  const measured = layoutsFor(areaPx, remPx, cards.length).flatMap((layout) => {
    // Shrunk cards leave room to be wider, up to the widest a card goes.
    const widest = (layout.cols * deckRules.maxCard + (layout.cols - 1) * deckRules.gap) * remPx
    const atZoom = (zoom: number) => measure({ ...layout, zoom, width: Math.floor(Math.min(areaPx / zoom, widest)) })
    const largest = measure(layout)
    if (largest.height <= availablePx || layout.zoom === 1) return [largest]
    // Too tall at this size: the same columns at the largest zoom that fits, found by halving, down to no zoom at all.
    let fits = atZoom(1)
    if (fits.height > availablePx) return [largest, fits]
    let over = layout.zoom
    for (let step = 0; step < 4; step += 1) {
      const middle = atZoom(round((fits.zoom + over) / 2))
      if (middle.height <= availablePx) fits = middle
      else over = middle.zoom
    }
    return [fits]
  })
  apply(content, pickLayout(measured.filter((layout) => layout.cols === 1 || layout.used === layout.cols), availablePx, remPx))
}

/**
 * Keeps the page of cards inside `main` laid out for its window. `view` re-runs
 * it when the screen changes. It follows the page's own size rather than every
 * change inside it: a card that opens, a chart that arrives or a page folded up
 * to be arranged all change how tall the page is, and nothing else matters here.
 */
export function useFitColumns(main: RefObject<HTMLElement | null>, view: string) {
  useLayoutEffect(() => {
    const element = main.current
    if (!element || typeof matchMedia !== 'function' || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const run = () => {
      frame = 0
      fit(element)
    }
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(run)
    }
    const sizes = new ResizeObserver(soon)
    const watched = new Set<Element>()
    let decks = -1
    /** Follows whatever is a deck now; true when that is not what it was. */
    const watch = () => {
      const now = [element, ...element.querySelectorAll('.is-deck, .deck')]
      let changed = now.length !== decks
      decks = now.length
      for (const el of now) {
        if (watched.has(el)) continue
        watched.add(el)
        sizes.observe(el)
        changed = true
      }
      return changed
    }
    // The deck is swapped for a list of names while a page is arranged, and a tab
    // can mount its cards a beat after the tab itself. A chart redrawing itself is
    // a storm of changes that are none of this, so only a deck coming or going counts.
    const arrivals = new MutationObserver(() => {
      if (watch()) soon()
    })
    arrivals.observe(element, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
    watch()
    fit(element)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      sizes.disconnect()
      arrivals.disconnect()
    }
  }, [main, view])
}
