import { useMemo } from 'react'
import { bulkGrade, PACE_BANDS, PARTITION_BANDS } from '../../lib/bulkGrade'
import type { MassTrend } from '../../lib/massSplit'

/**
 * One reading on a four-band track: the band it falls in lit in the accent, a
 * marker at the exact spot inside it, and the band names ruled underneath so
 * the distance to the next one — to dirty, to too fast — is there to see.
 */
function Track({
  value,
  bands,
  at,
  active,
}: {
  value: string
  bands: readonly string[]
  at: number | null
  active: string | null
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-20 shrink-0 pt-0.5 text-sm font-medium tabular-nums">{value}</div>
      <div className="min-w-0 flex-1">
        <div className="relative flex h-2.5 gap-0.5">
          {bands.map((b) => (
            <div key={b} className={`flex-1 rounded-sm ${b === active ? 'bg-accent' : 'bg-surface-2'}`} />
          ))}
          {at != null && (
            <div
              className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-on-accent ring-2 ring-accent"
              style={{ left: `${Math.min(98, Math.max(2, at * 100))}%` }}
            />
          )}
        </div>
        <div className="mt-1 flex text-[10px] leading-none">
          {bands.map((b) => (
            <span
              key={b}
              className={`flex-1 text-center ${b === active ? 'font-semibold text-neutral-200' : 'text-neutral-500'}`}
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * How the bulk is going, judged on the two things the trials measure (see
 * lib/bulkGrade): how much of the weight gained is muscle, and how fast it is
 * going on, both read off the trend lines the chart above draws. Two tracks,
 * each with the marker sat where this bulk falls, so a
 * reading drifting toward the dirty end is visible weeks before it gets there.
 * No headline over them: a one-word call rolled up from two readings only ever
 * argued with the track it was summarising (see the note in lib/bulkGrade).
 */
export function BulkGradePanel({ trend }: { trend: MassTrend | null }) {
  const grade = useMemo(() => bulkGrade(trend), [trend])
  if (!trend) return null

  if (!grade.ready) {
    return (
      <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 text-sm">
        <span className="font-semibold">too soon to grade</span>
        <span className="text-neutral-500">{grade.days} days in</span>
      </div>
    )
  }

  const shareLabel =
    grade.share == null
      ? 'none'
      : grade.share >= 1
        ? 'all muscle'
        : grade.share <= 0
          ? 'all fat'
          : `${Math.round(grade.share * 100)}% muscle`
  const weeks = Math.round(grade.days / 7)

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface px-4 py-3">
      <span className="text-xs text-neutral-500">{weeks} weeks in</span>
      <Track value={shareLabel} bands={PARTITION_BANDS} at={grade.partitionAt} active={grade.partition} />
      <Track
        value={`${grade.lbsPerWeek.toFixed(1)} lb/wk`}
        bands={PACE_BANDS}
        at={grade.paceAt}
        active={grade.pace}
      />
    </div>
  )
}
