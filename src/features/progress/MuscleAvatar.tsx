import { useMemo, type ReactNode } from 'react'
import { useData } from '../../store/DataContext'
import { exerciseSeries } from '../../lib/progress'
import {
  AVATAR_EXERCISE_KEYS,
  BASELINE_SESSIONS,
  EXERCISE_SOURCES,
  ladderReadouts,
  liftReadouts,
  muscleDevelopment,
  MUSCLES,
  type ExerciseLog,
  type Muscle,
  type MuscleScore,
} from '../../lib/strengthStandards'

/** Neutral fill for the body base and "no data" muscles. */
const BODY_BASE = '#26262b'
const NO_DATA = '#3f3f46'
const STROKE = '#0a0a0a'

/**
 * Floor on the fill's development score. A muscle sitting at the very bottom of
 * its scale is honestly scored near 0, but the green at 0 is darker than the
 * "no data" grey — which reads backwards, since a trained muscle shouldn't look
 * emptier than an untrained one. The band label stays unfloored.
 */
const MIN_FILL_DEV = 0.2

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
  return devColor(Math.max(MIN_FILL_DEV, score.developmentScore))
}

const MUSCLE_LABELS: Record<Muscle, string> = {
  neck: 'neck',
  shoulders: 'shoulders',
  chest: 'chest',
  back: 'back / lats',
  biceps: 'biceps',
  triceps: 'triceps',
  core: 'core',
  quads: 'quads',
  hamstrings: 'hamstrings',
  calves: 'calves',
}

function titleFor(muscle: Muscle, score: MuscleScore | undefined): string {
  const name = MUSCLE_LABELS[muscle]
  if (!score || !score.hasData) return `${name} — no data`
  if (score.basis === 'presence') return `${name} — trained`
  if (score.basis === 'ladder') return `${name} — ${score.band} on your own scale`
  return `${name} — ${score.band}`
}

/*
 * Region geometry, on a shared 220×470 silhouette. The arm, thigh and calf masses
 * are the same shapes in both views — the upper arm reads as one lump from either
 * side, it's just biceps from the front and triceps from the back — so the pairs
 * below are declared once and attributed differently per view.
 */
/** The shoulder cap, bridging the arm's top and the torso's upper corner. */
const DELTS = [
  'M57 110 Q55 88 76 79 Q93 84 92 102 Q74 114 57 110 Z',
  'M163 110 Q165 88 144 79 Q127 84 128 102 Q146 114 163 110 Z',
]
const UPPER_ARMS = [
  'M58 106 Q55 140 56.5 172 L66 172 Q68 140 70 106 Z',
  'M162 106 Q165 140 163.5 172 L154 172 Q152 140 150 106 Z',
]
const THIGHS = ['M91 258 Q86 308 91 354 L106 354 L105 258 Z', 'M129 258 Q134 308 129 354 L114 354 L115 258 Z']
const CALVES = ['M92 364 Q90 394 96 424 L107 424 L107 364 Z', 'M128 364 Q130 394 124 424 L113 424 L113 364 Z']
const PECS = [
  'M75 92 Q88 84 107 89 L107 119 Q88 127 77 116 Q72 104 75 92 Z',
  'M145 92 Q132 84 113 89 L113 119 Q132 127 143 116 Q148 104 145 92 Z',
]
const ABS = ['M93 128 L127 128 Q129 166 121 208 L99 208 Q91 166 93 128 Z']
const NECK_FRONT = ['M101 60 L119 60 L119 74 Q119 79 114 79 L106 79 Q101 79 101 74 Z']
/** Neck + the upper-trap yoke it feeds — what neck extension actually changes. */
const NECK_BACK = ['M101 60 L119 60 L119 76 Q128 80 130 93 Q121 88 110 88 Q99 88 90 93 Q92 80 101 76 Z']
/** The lat V, which is the whole of what's colorable on the upper back. */
const LATS = ['M80 92 Q73 130 86 176 Q98 196 110 199 Q122 196 134 176 Q147 130 140 92 Q110 84 80 92 Z']

/** One muscle's regions, filled from its development score. */
function Regions({
  muscle,
  scores,
  paths,
}: {
  muscle: Muscle
  scores: Record<Muscle, MuscleScore>
  paths: string[]
}) {
  const score = scores[muscle]
  return (
    <>
      {paths.map((d) => (
        <path
          key={d}
          d={d}
          fill={fillFor(score)}
          stroke={STROKE}
          strokeWidth={1}
          className="motion-safe:transition-[fill] motion-safe:duration-500"
        >
          <title>{titleFor(muscle, score)}</title>
        </path>
      ))}
    </>
  )
}

/** The neutral silhouette both views draw their regions on. */
function Silhouette({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col items-center gap-1">
      <svg viewBox="0 0 220 470" className="h-auto w-full" role="img" aria-label={`${label} muscle map`}>
        {/* Head, neck, torso, arms, pelvis, legs. */}
        <g fill={BODY_BASE} stroke="#3f3f46" strokeWidth={1.5}>
          <ellipse cx="110" cy="38" rx="19" ry="23" />
          <rect x="100" y="54" width="20" height="26" rx="5" />
          <path d="M74 78 Q110 70 146 78 Q150 120 142 150 Q138 190 128 214 L92 214 Q82 190 78 150 Q70 120 74 78 Z" />
          <path d="M74 82 Q58 90 54 118 L52 182 Q52 202 60 216 L70 210 Q64 196 66 176 L70 120 Q71 96 78 86 Z" />
          <path d="M146 82 Q162 90 166 118 L168 182 Q168 202 160 216 L150 210 Q156 196 154 176 L150 120 Q149 96 142 86 Z" />
          <path d="M90 212 L130 212 Q136 236 132 256 L88 256 Q84 236 90 212 Z" />
          <path d="M90 250 Q84 300 90 360 Q92 415 98 458 L110 458 L108 360 L106 300 L106 250 Z" />
          <path d="M130 250 Q136 300 130 360 Q128 415 122 458 L110 458 L112 360 L114 300 L114 250 Z" />
        </g>
        {children}
      </svg>
      <figcaption className="text-xs tracking-wider text-neutral-500">{label}</figcaption>
    </figure>
  )
}

function FrontView({ scores }: { scores: Record<Muscle, MuscleScore> }) {
  return (
    <Silhouette label="front">
      <Regions muscle="neck" scores={scores} paths={NECK_FRONT} />
      {/* Pecs before the delts: the shoulder cap sits in front of the chest's
          upper-outer corner, the way it does on a body. */}
      <Regions muscle="chest" scores={scores} paths={PECS} />
      <Regions muscle="shoulders" scores={scores} paths={DELTS} />
      <Regions muscle="biceps" scores={scores} paths={UPPER_ARMS} />
      <Regions muscle="core" scores={scores} paths={ABS} />
      <Regions muscle="quads" scores={scores} paths={THIGHS} />
    </Silhouette>
  )
}

function BackView({ scores }: { scores: Record<Muscle, MuscleScore> }) {
  return (
    <Silhouette label="back">
      {/* Lats first, then the trap yoke over them, then the delts on top — each
          sits in front of the mass it overlaps from behind. */}
      <Regions muscle="back" scores={scores} paths={LATS} />
      <Regions muscle="neck" scores={scores} paths={NECK_BACK} />
      <Regions muscle="shoulders" scores={scores} paths={DELTS} />
      <Regions muscle="triceps" scores={scores} paths={UPPER_ARMS} />
      <Regions muscle="hamstrings" scores={scores} paths={THIGHS} />
      <Regions muscle="calves" scores={scores} paths={CALVES} />
    </Silhouette>
  )
}

function Legend() {
  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500">
      <span>less</span>
      <span
        className="h-2 flex-1 rounded-full"
        style={{ background: `linear-gradient(90deg, ${devColor(0)}, ${devColor(0.5)}, ${devColor(1)})` }}
      />
      <span>more</span>
    </div>
  )
}

export function MuscleAvatar() {
  const { workouts, bodyWeights } = useData()

  const latestWeight = bodyWeights.filter((b) => b.weightLbs >= 50).slice(-1)[0]
  const bodyweightLb = latestWeight?.weightLbs ?? 0

  const logs = useMemo(() => {
    const out: Record<string, ExerciseLog> = {}
    for (const key of AVATAR_EXERCISE_KEYS) {
      // Reps ladders grow by reps, not load — a bodyweight hanging raise has no
      // est-1RM to read at all.
      const metric = EXERCISE_SOURCES[key].ladder === 'reps' ? 'topreps' : '1rm'
      const series = exerciseSeries(workouts, key, metric)
      if (series.length === 0) continue // not logged → "no data" for its muscle
      out[key] = {
        best: series.reduce((m, p) => Math.max(m, p.value), 0),
        earliest: series.slice(0, BASELINE_SESSIONS).map((p) => p.value),
      }
    }
    return out
  }, [workouts])

  const scores = useMemo(() => muscleDevelopment(logs, bodyweightLb), [logs, bodyweightLb])
  const lifts = useMemo(() => liftReadouts(logs, bodyweightLb), [logs, bodyweightLb])
  const ladders = useMemo(() => ladderReadouts(logs), [logs])

  const hasAnyData = MUSCLES.some((m) => scores[m].hasData)

  return (
    <div className="flex flex-col gap-3">
      <h3 className="mt-2 text-sm font-semibold tracking-wider text-neutral-500">
        strength map{bodyweightLb ? ` · ${bodyweightLb} lbs` : ''}
      </h3>

      {!bodyweightLb ? (
        <div className="flex min-h-24 items-center justify-center rounded-2xl bg-surface px-4 text-center text-sm text-neutral-500">
          log a body weight to compare your lifts to other men.
        </div>
      ) : !hasAnyData ? (
        <div className="flex min-h-24 items-center justify-center rounded-2xl bg-surface px-4 text-center text-sm text-neutral-500">
          log a few lifts to build your strength map.
        </div>
      ) : (
        <div className="rounded-2xl bg-surface p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="mx-auto flex w-full max-w-[300px] flex-col gap-2 sm:mx-0 sm:w-1/2 sm:max-w-none">
              <div className="grid grid-cols-2 gap-2">
                <FrontView scores={scores} />
                <BackView scores={scores} />
              </div>
              <Legend />
            </div>

            <div className="flex flex-1 flex-col gap-4">
              <div className="flex flex-col gap-2">
                <p className="text-xs tracking-wider text-neutral-500">
                  estimated 1rm vs. men at {bodyweightLb} lbs
                </p>
                {lifts.length > 0 ? (
                  <ul className="flex flex-col gap-1">
                    {lifts.map((r) => (
                      <li key={r.lift} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-neutral-300">{r.label}</span>
                        <span className="tabular-nums text-neutral-500">
                          est. 1rm {r.load} lbs · <span className="text-accent-2">{r.band}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-neutral-500">
                    log a weighted lift (squat, bench, press) to see your strength level.
                  </p>
                )}
              </div>

              {ladders.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs tracking-wider text-neutral-500">
                    your own progression · from where you started
                  </p>
                  <ul className="flex flex-col gap-1">
                    {ladders.map((r) => (
                      <li key={r.key} className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-neutral-300">{r.label}</span>
                        <span className="tabular-nums text-neutral-500">
                          {r.baseline} → {r.best} {r.unit} · <span className="text-accent-2">{r.band}</span>
                          {r.next && ` · ${r.next.band} at ${r.next.value}`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
