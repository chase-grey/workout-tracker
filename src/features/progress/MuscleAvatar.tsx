import { useMemo } from 'react'
import { useData } from '../../store/DataContext'
import { exerciseSeries } from '../../lib/progress'
import {
  AVATAR_EXERCISE_KEYS,
  legsVsUpper,
  liftReadouts,
  muscleDevelopment,
  MUSCLES,
  type Muscle,
  type MuscleScore,
} from '../../lib/strengthStandards'

/** Neutral fill for the body base and "no data" muscles. */
const BODY_BASE = '#26262b'
const NO_DATA = '#3f3f46'
const STROKE = '#0a0a0a'

/** Development 0..1 → a green on the theme scale (dark green → bright green). */
function devColor(dev: number): string {
  // Two-stop lerp: #14532d (green-900) → #16a34a (accent) → #4ade80 (green-400).
  const stops: [number, [number, number, number]][] = [
    [0, [20, 83, 45]],
    [0.5, [22, 163, 74]],
    [1, [74, 222, 128]],
  ]
  const d = Math.max(0, Math.min(1, dev))
  let lo = stops[0]
  let hi = stops[stops.length - 1]
  for (let i = 1; i < stops.length; i++) {
    if (d <= stops[i][0]) {
      lo = stops[i - 1]
      hi = stops[i]
      break
    }
  }
  const span = hi[0] - lo[0] || 1
  const t = (d - lo[0]) / span
  const rgb = lo[1].map((c, i) => Math.round(c + (hi[1][i] - c) * t))
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`
}

function fillFor(score: MuscleScore | undefined): string {
  if (!score || !score.hasData) return NO_DATA
  return devColor(score.developmentScore)
}

function titleFor(muscle: Muscle, score: MuscleScore | undefined): string {
  const name = MUSCLE_LABELS[muscle]
  if (!score || !score.hasData) return `${name} — no data`
  if (score.percentile == null) return `${name} — trained`
  return `${name} — ${score.band} (${ordinal(score.percentile)} percentile)`
}

const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: 'Chest',
  shoulders: 'Shoulders',
  back: 'Back / lats',
  biceps: 'Biceps',
  triceps: 'Triceps',
  core: 'Core',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

/**
 * One colored region of the silhouette. `d` (path) or ellipse props; fill comes
 * from the muscle's development score.
 */
function Region({ muscle, score, d }: { muscle: Muscle; score: MuscleScore | undefined; d: string }) {
  return (
    <path
      d={d}
      fill={fillFor(score)}
      stroke={STROKE}
      strokeWidth={1}
      className="motion-safe:transition-[fill] motion-safe:duration-500"
    >
      <title>{titleFor(muscle, score)}</title>
    </path>
  )
}

/** Front-view silhouette with distinct, individually-colored muscle regions. */
function Silhouette({ scores }: { scores: Record<Muscle, MuscleScore> }) {
  return (
    <svg
      viewBox="0 0 220 470"
      className="h-auto w-full max-w-[220px]"
      role="img"
      aria-label="Muscle development map"
    >
      {/* Neutral body base — head, torso, arms, pelvis, legs. */}
      <g fill={BODY_BASE} stroke="#3f3f46" strokeWidth={1.5}>
        <ellipse cx="110" cy="40" rx="19" ry="23" />
        <rect x="102" y="58" width="16" height="14" rx="4" />
        <path d="M74 78 Q110 70 146 78 Q150 120 142 150 Q138 190 128 214 L92 214 Q82 190 78 150 Q70 120 74 78 Z" />
        <path d="M74 82 Q58 90 54 118 L52 182 Q52 202 60 216 L70 210 Q64 196 66 176 L70 120 Q71 96 78 86 Z" />
        <path d="M146 82 Q162 90 166 118 L168 182 Q168 202 160 216 L150 210 Q156 196 154 176 L150 120 Q149 96 142 86 Z" />
        <path d="M90 212 L130 212 Q136 236 132 256 L88 256 Q84 236 90 212 Z" />
        <path d="M90 250 Q84 300 90 360 Q92 415 98 458 L110 458 L108 360 L106 300 L106 250 Z" />
        <path d="M130 250 Q136 300 130 360 Q128 415 122 458 L110 458 L112 360 L114 300 L114 250 Z" />
      </g>

      {/* Muscle overlays (back/lats first so the core sits on top of them). */}
      <Region muscle="back" score={scores.back} d="M80 118 Q72 148 86 176 Q84 148 84 122 Z" />
      <Region muscle="back" score={scores.back} d="M140 118 Q148 148 134 176 Q136 148 136 122 Z" />

      <Region muscle="shoulders" score={scores.shoulders} d="M60 90 Q76 74 92 90 Q84 104 60 100 Z" />
      <Region muscle="shoulders" score={scores.shoulders} d="M160 90 Q144 74 128 90 Q136 104 160 100 Z" />

      <Region muscle="chest" score={scores.chest} d="M86 96 Q108 92 108 118 Q96 124 86 116 Q82 104 86 96 Z" />
      <Region muscle="chest" score={scores.chest} d="M134 96 Q112 92 112 118 Q124 124 134 116 Q138 104 134 96 Z" />

      <Region muscle="core" score={scores.core} d="M92 124 L128 124 Q130 162 122 208 L98 208 Q90 162 92 124 Z" />

      <Region muscle="triceps" score={scores.triceps} d="M49 106 Q46 140 52 172 L58 172 Q56 140 57 106 Z" />
      <Region muscle="triceps" score={scores.triceps} d="M171 106 Q174 140 168 172 L162 172 Q164 140 163 106 Z" />

      <Region muscle="biceps" score={scores.biceps} d="M58 106 Q56 140 60 172 L70 172 Q68 140 68 106 Z" />
      <Region muscle="biceps" score={scores.biceps} d="M162 106 Q164 140 160 172 L150 172 Q152 140 152 106 Z" />

      <Region muscle="hamstrings" score={scores.hamstrings} d="M90 260 Q85 310 90 356 L95 356 Q90 310 93 260 Z" />
      <Region muscle="hamstrings" score={scores.hamstrings} d="M130 260 Q135 310 130 356 L125 356 Q130 310 127 260 Z" />

      <Region muscle="quads" score={scores.quads} d="M93 260 Q89 310 95 356 L106 356 L106 260 Z" />
      <Region muscle="quads" score={scores.quads} d="M127 260 Q131 310 125 356 L114 356 L114 260 Z" />
    </svg>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500">
      <span>Less</span>
      <span
        className="h-2 flex-1 rounded-full"
        style={{ background: `linear-gradient(90deg, ${devColor(0)}, ${devColor(0.5)}, ${devColor(1)})` }}
      />
      <span>More</span>
    </div>
  )
}

export function MuscleAvatar() {
  const { workouts, bodyWeights } = useData()

  const latestWeight = bodyWeights.filter((b) => b.weightLbs >= 50).slice(-1)[0]
  const bodyweightLb = latestWeight?.weightLbs ?? 0

  const bestLiftsByKey = useMemo(() => {
    const out: Record<string, number> = {}
    for (const key of AVATAR_EXERCISE_KEYS) {
      const series = exerciseSeries(workouts, key, '1rm')
      if (series.length === 0) continue // not logged → "no data" for its muscle
      out[key] = series.reduce((m, p) => Math.max(m, p.value), 0)
    }
    return out
  }, [workouts])

  const scores = useMemo(
    () => muscleDevelopment(bestLiftsByKey, bodyweightLb),
    [bestLiftsByKey, bodyweightLb],
  )
  const readouts = useMemo(
    () => liftReadouts(bestLiftsByKey, bodyweightLb),
    [bestLiftsByKey, bodyweightLb],
  )
  const balance = useMemo(() => legsVsUpper(scores), [scores])

  const hasAnyData = MUSCLES.some((m) => scores[m].hasData)

  return (
    <div className="flex flex-col gap-3">
      <h3 className="mt-2 text-sm font-semibold uppercase tracking-wider text-neutral-500">
        Strength map{bodyweightLb ? ` · ${bodyweightLb} lbs` : ''}
      </h3>

      {!bodyweightLb ? (
        <div className="flex min-h-24 items-center justify-center rounded-2xl bg-surface px-4 text-center text-sm text-neutral-500">
          Log a body weight to compare your lifts to other men.
        </div>
      ) : !hasAnyData ? (
        <div className="flex min-h-24 items-center justify-center rounded-2xl bg-surface px-4 text-center text-sm text-neutral-500">
          Log a few lifts to build your strength map.
        </div>
      ) : (
        <div className="rounded-2xl bg-surface p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="mx-auto flex w-full max-w-[220px] flex-col gap-2 sm:mx-0 sm:w-1/2">
              <Silhouette scores={scores} />
              <Legend />
            </div>

            <div className="flex flex-1 flex-col gap-2">
              <p className="text-xs uppercase tracking-wider text-neutral-500">
                Percentile vs. men at {bodyweightLb} lbs
              </p>
              {readouts.length > 0 ? (
                <ul className="flex flex-col gap-1">
                  {readouts.map((r) => (
                    <li key={r.lift} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-neutral-300">{r.label}</span>
                      <span className="tabular-nums text-neutral-500">
                        {r.load} lbs · <span className="text-accent-2">{ordinal(r.percentile)}</span> · {r.band}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-500">
                  Log a weighted lift (squat, bench, press) to see your percentiles.
                </p>
              )}

              {balance && <p className="mt-1 text-sm text-neutral-400">{balance.verdict}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
