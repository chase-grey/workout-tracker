import { useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { MdArrowBack, MdBuild } from 'react-icons/md'
import { useBackGuard } from '../../lib/useBackGuard'
import {
  chatTitle,
  chatWhen,
  loadChats,
  saveChats,
  withoutChat,
  type KeptChat,
  type KeptTurn,
} from '../../lib/coachChats'
import { Markdown } from './Markdown'

const STATUS_WORDS = { pending: 'not answered', approved: 'approved', rejected: 'rejected' } as const

/** One kept turn, drawn the way the thread drew it, with nothing left to press. */
function PastTurn({ turn }: { turn: KeptTurn }) {
  if (turn.proposal) {
    return (
      <div className="mx-auto w-full max-w-[85%] rounded-2xl border border-border bg-surface-2 px-3 py-2">
        <div className="flex items-center gap-1 text-xs text-accent-2">
          <MdBuild className="shrink-0" aria-hidden />
          {turn.content}
        </div>
        <ul className="mt-1 list-disc pl-5 text-sm text-neutral-100">
          {turn.proposal.changes.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
        <div className="mt-1 text-xs text-neutral-500">{STATUS_WORDS[turn.proposal.status]}</div>
      </div>
    )
  }
  if (turn.role === 'system') {
    return (
      <div className="mx-auto rounded-full bg-accent-2/15 px-3 py-1 text-xs text-accent-2">
        <MdBuild className="mr-1 inline align-text-bottom" aria-hidden />
        {turn.content}
      </div>
    )
  }
  return (
    <div className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
          turn.role === 'user'
            ? 'whitespace-pre-wrap bg-accent-dark text-white'
            : turn.error
              ? 'whitespace-pre-wrap bg-surface-2 text-red-400'
              : 'bg-surface-2 text-neutral-100'
        }`}
      >
        {turn.role === 'assistant' && !turn.error ? <Markdown text={turn.content} /> : turn.content}
      </div>
    </div>
  )
}

/**
 * The coach's past chats (lib/coachChats): a list, newest first, and the one
 * tapped, read as it was. Nothing here talks to the coach; a past chat is for
 * reading back. Removing one takes the second tap every removal here does.
 */
export function PastChats({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const [chats, setChats] = useState<KeptChat[]>(() => loadChats())
  const [openId, setOpenId] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const open = chats.find((c) => c.id === openId) ?? null
  const back = () => {
    setOpenId(null)
    setConfirmRemove(false)
  }
  // Back steps out of the chat being read first, then out of the list.
  useBackGuard(true, open ? back : onClose)

  const remove = (id: string) => {
    if (!confirmRemove) return setConfirmRemove(true)
    const next = withoutChat(loadChats(), id)
    saveChats(next)
    setChats(next)
    back()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-80 flex items-end bg-black/60"
      data-no-hold=""
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[85vh] w-full flex-col rounded-t-3xl bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <div className="mb-3 flex items-center gap-2">
          {open && (
            <button
              type="button"
              onClick={back}
              aria-label="back to past chats"
              className="-my-2 -ml-2 flex h-11 w-11 shrink-0 items-center justify-center text-neutral-300 active:opacity-70"
            >
              <MdArrowBack className="text-xl" aria-hidden />
            </button>
          )}
          <h3 id={titleId} className="min-w-0 flex-1 truncate text-lg font-bold">
            {open ? chatWhen(open.startedAt) : 'past chats'}
          </h3>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {open ? (
            <div className="flex flex-col gap-3">
              {open.turns.map((t, i) => (
                <PastTurn key={i} turn={t} />
              ))}
            </div>
          ) : chats.length === 0 ? (
            <div className="flex h-24 items-center justify-center rounded-2xl bg-surface-2 text-sm text-neutral-500">
              no past chats yet
            </div>
          ) : (
            <div className="divide-y divide-border rounded-2xl bg-surface-2 px-3">
              {chats.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setOpenId(c.id)}
                  className="flex min-h-[48px] w-full items-center gap-3 py-2 text-left text-sm active:opacity-70"
                >
                  <span className="w-16 shrink-0 text-neutral-500 tabular-nums">{chatWhen(c.updatedAt)}</span>
                  <span className="min-w-0 flex-1 truncate text-neutral-200">{chatTitle(c)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {open && (
          <button
            type="button"
            onClick={() => remove(open.id)}
            className="mt-4 min-h-[44px] w-full rounded-2xl text-sm font-medium text-neutral-400 active:opacity-80"
          >
            {confirmRemove ? 'tap again to remove' : 'remove'}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className={`${open ? 'mt-1' : 'mt-4'} min-h-[48px] w-full rounded-2xl bg-surface-2 font-semibold text-neutral-200 active:opacity-80`}
        >
          close
        </button>
      </div>
    </div>,
    document.body,
  )
}
