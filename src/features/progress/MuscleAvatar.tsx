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
  glutes: 'glutes',
  quads: 'quads',
  hamstrings: 'hamstrings',
  adductors: 'adductors / inner thigh',
  abductors: 'abductors / outer hip',
  calves: 'calves',
}

function titleFor(muscle: Muscle, score: MuscleScore | undefined): string {
  const name = MUSCLE_LABELS[muscle]
  if (!score || !score.hasData) return `${name} — no data`
  if (score.basis === 'presence') return `${name} — trained`
  if (score.basis === 'ladder') return `${name} — ${score.band} on my own scale`
  return `${name} — ${score.band}`
}

/*
 * Region geometry, on a shared 220×470 silhouette. The arm and calf masses are
 * the same shapes in both views — the upper arm reads as one lump from either
 * side, it's just biceps from the front and triceps from the back — so the pairs
 * below are declared once and attributed differently per view.
 *
 * The thigh is the exception: from behind it's one hamstring mass, but from the
 * front it splits three ways, an inner strip for the adductors and an upper-outer
 * one for the abductors flanking the quads.
 */
/** The shoulder cap, bridging the arm's top and the torso's upper corner. */
const DELTS = [
  'M45 110 Q50 86 76 78 Q94 83 93 103 Q71 118 45 110 Z',
  'M175 110 Q170 86 144 78 Q126 83 127 103 Q149 118 175 110 Z',
]
const UPPER_ARMS = [
  'M47 104 Q45 140 47 176 L64 176 Q67 140 71 104 Z',
  'M173 104 Q175 140 173 176 L156 176 Q153 140 149 104 Z',
]
/**
 * The whole thigh mass: the hamstrings from behind, the quads from the front.
 * The two hip strips below are drawn OVER it rather than carved out of it — the
 * thigh stays one solid mass either way round, with the inner and outer bands
 * simply taking their own color.
 */
const THIGHS = ['M82 260 Q74 306 78 352 L99 352 L103 260 Z', 'M138 260 Q146 306 142 352 L121 352 L117 260 Z']
/** The inner thigh, running the length of the mass. */
const ADDUCTORS = ['M103 260 L99 352 L93 352 L96 260 Z', 'M117 260 L121 352 L127 352 L124 260 Z']
/** The outer hip, where abduction actually shows — high on the thigh, not down it. */
const ABDUCTORS = [
  'M80 252 Q78 280 77 306 L84 306 Q86 278 88 252 Z',
  'M140 252 Q142 280 143 306 L136 306 Q134 278 132 252 Z',
]
/** Both cheeks, filling the pelvis on the back view. */
const GLUTES = [
  'M88 218 Q79 226 80 244 Q86 258 97 255 Q107 248 106 234 Q100 220 88 218 Z',
  'M132 218 Q141 226 140 244 Q134 258 123 255 Q113 248 114 234 Q120 220 132 218 Z',
]
const CALVES = ['M80 372 Q80 402 84 434 L92 434 Q95 402 95 372 Z', 'M140 372 Q140 402 136 434 L128 434 Q125 402 125 372 Z']
const PECS = [
  'M71 92 Q86 82 107 88 L107 121 Q86 130 74 117 Q67 105 71 92 Z',
  'M149 92 Q134 82 113 88 L113 121 Q134 130 146 117 Q153 105 149 92 Z',
]
/**
 * Starts below the rib cage, not at the pec line — the gap is where the ribs are —
 * and runs down past the navel to the V of the lower abs at the groin.
 */
const ABS = ['M95 144 L125 144 Q132 172 127 208 Q124 234 116 246 L104 246 Q96 234 93 208 Q88 172 95 144 Z']
const NECK_FRONT = ['M101 60 L119 60 L119 74 Q119 79 114 79 L106 79 Q101 79 101 74 Z']
/** Neck + the upper-trap yoke it feeds — what neck extension actually changes. */
const NECK_BACK = ['M101 60 L119 60 L119 76 Q128 80 130 93 Q121 88 110 88 Q99 88 90 93 Q92 80 101 76 Z']
/** The lat V, which is the whole of what's colorable on the upper back. */
const LATS = ['M73 92 Q67 132 85 176 Q98 196 110 199 Q122 196 135 176 Q153 132 147 92 Q110 82 73 92 Z']

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
          <path d="M70 78 Q110 68 150 78 Q155 118 145 152 Q140 190 132 214 L88 214 Q80 190 75 152 Q65 118 70 78 Z" />
          <path d="M74 82 Q48 84 43 116 L45 190 Q46 220 55 252 L70 250 Q63 218 66 180 L71 118 Q72 96 78 86 Z" />
          <path d="M146 82 Q172 84 177 116 L175 190 Q174 220 165 252 L150 250 Q157 218 154 180 L149 118 Q148 96 142 86 Z" />
          <path d="M52 246 L67 246 Q70 262 63 272 Q55 275 51 265 Q49 255 52 246 Z" />
          <path d="M168 246 L153 246 Q150 262 157 272 Q165 275 169 265 Q171 255 168 246 Z" />
          <path d="M88 212 L132 212 Q143 234 141 260 L79 260 Q77 234 88 212 Z" />
          <path d="M80 252 Q69 306 76 364 Q78 400 83 446 L94 446 Q96 400 98 362 Q104 302 107 252 Z" />
          <path d="M140 252 Q151 306 144 364 Q142 400 137 446 L126 446 Q124 400 122 362 Q116 302 113 252 Z" />
          <path d="M83 440 L96 440 Q98 452 95 459 L73 459 Q71 447 83 440 Z" />
          <path d="M137 440 L124 440 Q122 452 125 459 L147 459 Q149 447 137 440 Z" />
        </g>
        {children}
      </svg>
    </figure>
  )
}

/**
 * The tendinous inscriptions that cut the abs into six blocks. Only drawn once
 * the six-pack goal is marked reached — everybody has them, and seeing them is
 * the whole of the goal.
 */
function SixPackLines() {
  return (
    <g fill="none" stroke={STROKE} strokeWidth={1.6} strokeLinecap="round" opacity={0.8}>
      <path d="M110 152 L110 214" />
      <path d="M94 172 Q110 176 126 172" />
      <path d="M95 194 Q110 198 125 194" />
      <path d="M98 214 Q110 218 122 214" />
    </g>
  )
}

function FrontView({ scores, sixPack }: { scores: Record<Muscle, MuscleScore>; sixPack: boolean }) {
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
      {sixPack && <SixPackLines />}
      <Regions muscle="quads" scores={scores} paths={THIGHS} />
      <Regions muscle="abductors" scores={scores} paths={ABDUCTORS} />
      <Regions muscle="adductors" scores={scores} paths={ADDUCTORS} />
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
      <Regions muscle="glutes" scores={scores} paths={GLUTES} />
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

/**
 * One exercise: where it stands today, and on the line beneath, the load that
 * unlocks the tier above. The second line is dropped once there's no tier left.
 */
function Row({
  label,
  value,
  band,
  next,
  unit,
}: {
  label: string
  value: string
  band: string
  next: { band: string; value: number } | null
  unit: string
}) {
  return (
    <li className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-neutral-300">{label}</span>
        <span className="tabular-nums text-neutral-500">
          {value} · <span className="text-accent-2">{band}</span>
        </span>
      </div>
      {next && (
        <span className="text-right text-xs tabular-nums text-neutral-600">
          {next.band} at {next.value} {unit}
        </span>
      )}
    </li>
  )
}

export function MuscleAvatar() {
  const { workouts, bodyWeights, settings } = useData()

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
          log a body weight to compare my lifts to other men.
        </div>
      ) : !hasAnyData ? (
        <div className="flex min-h-24 items-center justify-center rounded-2xl bg-surface px-4 text-center text-sm text-neutral-500">
          log a few lifts to build my strength map.
        </div>
      ) : (
        <div className="rounded-2xl bg-surface p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="mx-auto flex w-full max-w-[300px] flex-col gap-2 sm:mx-0 sm:w-1/2 sm:max-w-none">
              <div className="grid grid-cols-2 gap-2">
                <FrontView scores={scores} sixPack={settings.sixPackStatus === 'have'} />
                <BackView scores={scores} />
              </div>
              <Legend />
            </div>

            <div className="flex flex-1 flex-col gap-4">
              {lifts.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {lifts.map((r) => (
                    <Row
                      key={r.lift}
                      label={r.label}
                      value={`est. 1rm ${r.load} lbs`}
                      band={r.band}
                      next={r.next}
                      unit="lbs"
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-neutral-500">
                  log a weighted lift (squat, bench, press) to see my strength level.
                </p>
              )}

              {ladders.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {ladders.map((r) => (
                    <Row
                      key={r.key}
                      label={r.label}
                      value={`${r.baseline} → ${r.best} ${r.unit}`}
                      band={r.band}
                      next={r.next}
                      unit={r.unit}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
