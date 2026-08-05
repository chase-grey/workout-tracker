import { MdArrowDownward, MdArrowUpward, MdEmojiEvents } from 'react-icons/md'
import { Sparkline } from '../../components/Sparkline'
import { fmtTick } from '../../lib/chart'
import { parseISODate } from '../../lib/dates'
import type { AngleTrend } from '../../lib/angleContext'

/** Cold readings keep the charts' blue; warm ones the accent green. */
const TEMP_COLOR: Record<AngleTrend['temp'], string> = { cold: '#38bdf8', warm: '#22c55e' }

const short = (iso: string) => fmtTick(parseISODate(iso).getTime())

/** Signed degrees, e.g. "+4°" / "-2°". */
const signed = (n: number) => `${n > 0 ? '+' : ''}${n}°`

/** One measured angle against its own history. */
function TrendRow({ t }: { t: AngleTrend }) {
  const color = TEMP_COLOR[t.temp]
  const up = t.delta != null && t.delta > 0
  const down = t.delta != null && t.delta < 0
  const goalPct = t.goal ? Math.min(100, (t.value / t.goal.target) * 100) : 100

  return (
    <div className="rounded-2xl bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold">{t.label}</span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-bold text-black"
          style={{ background: color }}
        >
          {t.temp}
        </span>
      </div>

      <div className="mt-1 flex items-end gap-3">
        <span className="text-5xl font-bold tabular-nums" style={{ color }}>
          {t.value}°
        </span>
        {t.delta != null && t.prev && (
          <span
            className={`flex items-center gap-0.5 pb-1.5 text-lg font-semibold tabular-nums ${
              up ? 'text-accent-2' : down ? 'text-red-400' : 'text-neutral-400'
            }`}
          >
            {up && <MdArrowUpward aria-hidden />}
            {down && <MdArrowDownward aria-hidden />}
            {signed(t.delta)}
            <span className="pl-1 text-sm font-normal text-neutral-500">
              vs {short(t.prev.date)}
            </span>
          </span>
        )}
      </div>

      {t.history.length >= 2 && (
        <div className="mt-2 flex items-center gap-3">
          <Sparkline values={t.history.map((p) => p.value)} width={140} height={34} color={color} />
          <span className="text-xs tabular-nums text-neutral-500">
            {short(t.history[0].date)} → today
          </span>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-1.5 text-sm">
        {t.isBest ? (
          <span className="flex items-center gap-1.5 font-semibold text-amber-400">
            <MdEmojiEvents aria-hidden /> best {t.temp} {t.label} yet
            {t.priorBest != null && (
              <span className="font-normal text-neutral-500">(was {t.priorBest}°)</span>
            )}
          </span>
        ) : t.priorBest != null && t.value === t.priorBest ? (
          <span className="font-semibold text-amber-400">matches your best {t.priorBest}°</span>
        ) : (
          t.priorBest != null && (
            <span className="text-neutral-400">
              best {t.priorBest}°{' '}
              <span className="text-neutral-500">({signed(t.value - t.priorBest)})</span>
            </span>
          )
        )}

        {t.coldToday != null && (
          <span className="text-neutral-400">
            {signed(Math.round((t.value - t.coldToday) * 10) / 10)} vs today's cold ({t.coldToday}°)
          </span>
        )}

        {t.prev == null && t.priorBest == null && (
          <span className="text-neutral-500">first {t.temp} reading of this angle</span>
        )}
      </div>

      {t.goal ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-neutral-400">next goal {t.goal.target}°</span>
            <span className="font-semibold tabular-nums" style={{ color }}>
              {t.goal.toGo}° to go
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full rounded-full" style={{ width: `${goalPct}%`, background: color }} />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm font-semibold text-amber-400">every goal for this angle cleared</p>
      )}
    </div>
  )
}

/**
 * What a just-measured angle means: the move since the last session, the
 * standing best, today's cold → warm gain, and the gap to the next goal. Shown
 * once per shot, over the photo screen, so the reading lands as progress instead
 * of as a number in a list.
 */
export function AngleContextCard({
  trends,
  onDismiss,
}: {
  trends: AngleTrend[]
  onDismiss: () => void
}) {
  return (
    // Above the photo screen (z-70), which is itself above rest + the measure sheet.
    <div className="fixed inset-0 z-80 flex flex-col bg-bg px-4 pt-8">
      <h2 className="text-xl font-bold">measured</h2>

      <div className="mt-4 flex flex-col gap-3 overflow-y-auto">
        {trends.map((t) => (
          <TrendRow key={t.metric} t={t} />
        ))}
      </div>

      <div
        className="mt-auto pt-4"
        style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={onDismiss}
          className="min-h-[56px] w-full rounded-2xl bg-accent text-lg font-bold text-black active:opacity-80"
        >
          got it
        </button>
      </div>
    </div>
  )
}
