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
  'M55 110 Q58 88 76 78 Q93 84 92 102 Q74 114 55 110 Z',
  'M165 110 Q162 88 144 78 Q127 84 128 102 Q146 114 165 110 Z',
]
const UPPER_ARMS = [
  'M55 104 Q52 140 53 176 L64 176 Q67 140 70 104 Z',
  'M165 104 Q168 140 167 176 L156 176 Q153 140 150 104 Z',
]
const THIGHS = ['M82 260 Q74 306 78 352 L99 352 L103 260 Z', 'M138 260 Q146 306 142 352 L121 352 L117 260 Z']
const CALVES = ['M77 372 Q72 402 80 434 L94 434 Q102 402 99 372 Z', 'M143 372 Q148 402 140 434 L126 434 Q118 402 121 372 Z']
const PECS = [
  'M75 92 Q88 84 107 89 L107 119 Q88 127 77 116 Q72 104 75 92 Z',
  'M145 92 Q132 84 113 89 L113 119 Q132 127 143 116 Q148 104 145 92 Z',
]
/** Starts below the rib cage, not at the pec line — the gap is where the ribs are. */
const ABS = ['M95 144 L125 144 Q132 172 126 208 L94 208 Q88 172 95 144 Z']
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
    <figure className="flex items-center justify-center">
      <svg viewBox="0 0 220 470" className="h-auto w-full" role="img" aria-label={`${label} muscle map`}>
        {/* Head, neck, torso, arms, hands, pelvis, legs, feet. */}
        <g fill={BODY_BASE} stroke="#3f3f46" strokeWidth={1.5}>
          <ellipse cx="110" cy="38" rx="19" ry="23" />
          <rect x="100" y="54" width="20" height="26" rx="5" />
          <path d="M74 78 Q110 70 146 78 Q150 120 143 152 Q139 190 132 214 L88 214 Q81 190 77 152 Q70 120 74 78 Z" />
          <path d="M74 82 Q55 88 52 116 L50 188 Q50 220 57 252 L70 250 Q64 218 66 180 L71 118 Q72 96 78 86 Z" />
          <path d="M146 82 Q165 88 168 116 L170 188 Q170 220 163 252 L150 250 Q156 218 154 180 L149 118 Q148 96 142 86 Z" />
          <path d="M56 246 L71 246 Q74 262 67 272 Q59 275 55 265 Q53 255 56 246 Z" />
          <path d="M164 246 L149 246 Q146 262 153 272 Q161 275 165 265 Q167 255 164 246 Z" />
          <path d="M88 212 L132 212 Q143 234 141 260 L79 260 Q77 234 88 212 Z" />
          <path d="M80 252 Q69 306 76 364 Q69 400 80 446 L95 446 Q105 400 101 362 Q104 302 107 252 Z" />
          <path d="M140 252 Q151 306 144 364 Q151 400 140 446 L125 446 Q115 400 119 362 Q116 302 113 252 Z" />
          <path d="M79 440 L96 440 Q98 452 95 459 L73 459 Q71 447 79 440 Z" />
          <path d="M141 440 L124 440 Q122 452 125 459 L147 459 Q149 447 141 440 Z" />
        </g>
        {children}
      </svg>
    </figure>
  )
}

function FrontView({ scores }: { scores: Record<Muscle, MuscleScore> }) {
  return (
    <Silhouette label="front">
      {/* The only thing telling the two views apart. */}
      <g fill="#a1a1aa">
        <ellipse cx="102" cy="34" rx="2.6" ry="3" />
        <ellipse cx="118" cy="34" rx="2.6" ry="3" />
      </g>
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
