import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MdAdd, MdClose, MdDragIndicator, MdEdit, MdExpandMore } from 'react-icons/md'
import { Collapse } from './Collapse'
import { ControlWord } from './ControlWord'
import {
  arrangeCards,
  hiddenCards,
  withCardAdded,
  withCardMoved,
  withCardRemoved,
  type CardLayout,
} from '../lib/cardLayout'
import { useBackGuard } from '../lib/useBackGuard'
import { useControlLabel } from '../lib/useControlLabel'
import { useDragSort } from '../lib/useDragSort'
import { useLongPress } from '../lib/useLongPress'

export type StackCard = {
  id: string
  /** What the card is called while the page is being arranged. */
  label: string
  node: ReactNode
  /** The card's own settings, opened under its name in edit mode. */
  editor?: ReactNode
  /** Off until added (see lib/cardLayout). */
  optional?: boolean
}

type Props = {
  /** Every card this person could have here, in the default order. */
  cards: StackCard[]
  layout: CardLayout | undefined
  onLayout: (layout: CardLayout) => void
  /** The space between cards, as a Tailwind gap class. */
  gap: string
}

/**
 * A page of cards that is arranged by holding it.
 *
 * Holding anywhere on the page turns it into a list of its cards by name: each
 * drags by its grip into a new place, an × takes it off, and the cards that
 * aren't showing wait underneath to be put on. A card with settings of its own
 * — the calendar's schedule, the calorie buttons — opens them under its name,
 * and the one that was held opens already, so holding the calendar is editing
 * the calendar.
 *
 * The cards fold to their names because a page of charts can't be dragged past
 * itself, and because a card that still took taps while being arranged would
 * log something on the way.
 */
export function EditableStack({ cards, layout, onLayout, gap }: Props) {
  const [edit, setEdit] = useState<{ focus: string | null } | null>(null)
  const shown = arrangeCards(cards, layout)
  const hidden = hiddenCards(cards, layout)
  const byId = new Map(cards.map((c) => [c.id, c]))
  const root = useRef<HTMLDivElement>(null)

  const close = () => setEdit(null)
  useBackGuard(edit != null, close)

  // The hold is invisible, so while labels are on there's a plain edit button
  // under the page too. Holding counts as a use of it: by the third time in,
  // you know where it is.
  const editLabel = useControlLabel('editTiles')
  const editEverShown = useRef(false)
  if (editLabel.show) editEverShown.current = true

  const open = (focus: string | null) => {
    editLabel.used()
    setEdit({ focus: focus && byId.get(focus)?.editor ? focus : null })
  }

  const hold = useLongPress((target) => open(target.closest('[data-card]')?.getAttribute('data-card') ?? null), edit != null)

  // The page has just folded up under the finger; bring what was held back into view.
  const focus = edit?.focus ?? null
  useEffect(() => {
    if (!edit) return
    const el = focus ? root.current?.querySelector(`[data-card="${focus}"]`) : root.current
    el?.scrollIntoView({ block: 'nearest' })
  }, [edit != null, focus]) // eslint-disable-line react-hooks/exhaustive-deps

  const sort = useDragSort(shown, (from, to) => onLayout(withCardMoved(layout, shown, from, to)))

  return (
    <div ref={root} className={`flex flex-col ${gap}`} {...hold}>
      {!edit &&
        shown.map((id) => (
          <div key={id} data-card={id} className={`flex flex-col ${gap}`}>
            {byId.get(id)!.node}
          </div>
        ))}

      {!edit && editEverShown.current && (
        <Collapse id="stack-edit" open={editLabel.show}>
          <button
            onClick={() => open(null)}
            aria-label="edit page"
            className="flex min-h-[44px] w-full items-center justify-center rounded-2xl text-xl text-neutral-400 active:bg-surface"
          >
            <MdEdit aria-hidden />
            <ControlWord show={editLabel.show} word={editLabel.word} layout="inline" />
          </button>
        </Collapse>
      )}

      {edit && (
        <>
          {shown.map((id) => {
            const card = byId.get(id)!
            const opened = focus === id && card.editor != null
            const row = sort.row(id)
            return (
              <div
                key={id}
                data-card={id}
                ref={row.ref}
                style={row.style}
                className={`rounded-2xl bg-surface ${sort.draggingId === id ? 'shadow-lg shadow-black/40' : ''}`}
              >
                <div className="flex min-h-[52px] items-center">
                  <span
                    {...sort.handle(id)}
                    role="button"
                    tabIndex={0}
                    aria-label={`move ${card.label}`}
                    className="flex h-[52px] w-11 shrink-0 cursor-grab items-center justify-center text-xl text-neutral-500"
                  >
                    <MdDragIndicator aria-hidden />
                  </span>
                  {card.editor ? (
                    <button
                      onClick={() => setEdit({ focus: opened ? null : id })}
                      aria-expanded={opened}
                      className="flex min-h-[52px] min-w-0 flex-1 items-center gap-1 text-left font-semibold active:opacity-70"
                    >
                      <span className="truncate">{card.label}</span>
                      <MdExpandMore
                        aria-hidden
                        className={`shrink-0 text-lg text-neutral-500 transition-transform motion-reduce:transition-none ${opened ? 'rotate-180' : ''}`}
                      />
                    </button>
                  ) : (
                    <span className="min-w-0 flex-1 truncate font-semibold">{card.label}</span>
                  )}
                  {shown.length > 1 && (
                    <button
                      onClick={() => onLayout(withCardRemoved(layout, shown, id))}
                      aria-label={`remove ${card.label}`}
                      className="flex h-[52px] w-12 shrink-0 items-center justify-center active:opacity-60"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-600 text-neutral-50">
                        <MdClose aria-hidden />
                      </span>
                    </button>
                  )}
                </div>
                {opened && <div className="px-3 pb-3">{card.editor}</div>}
              </div>
            )
          })}

          {hidden.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {hidden.map((id) => (
                <button
                  key={id}
                  onClick={() => onLayout(withCardAdded(layout, shown, id))}
                  aria-label={`add ${byId.get(id)!.label}`}
                  className="flex min-h-[44px] items-center gap-1 rounded-2xl border-2 border-dashed border-surface-2 px-3 text-sm font-medium text-neutral-400 active:bg-surface"
                >
                  <MdAdd aria-hidden className="text-lg" />
                  {byId.get(id)!.label}
                </button>
              ))}
            </div>
          )}

          {/* Held to the foot of the screen: an open card can push the end of the list a long way down. */}
          <button
            onClick={close}
            className="sticky bottom-2 z-10 min-h-[52px] rounded-2xl bg-accent text-lg font-bold text-on-accent shadow-lg shadow-black/50"
          >
            done
          </button>
        </>
      )}
    </div>
  )
}
