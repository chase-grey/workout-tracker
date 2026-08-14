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
  'M45 110 Q49 85 76 78 Q95 84 93 103 Q70 119 45 110 Z',
  'M175 110 Q171 85 144 78 Q125 84 127 103 Q150 119 175 110 Z',
]
const UPPER_ARMS = [
  'M47 104 Q44 140 47 176 Q56 180 64 176 Q68 140 71 104 Q59 99 47 104 Z',
  'M173 104 Q176 140 173 176 Q164 180 156 176 Q152 140 149 104 Q161 99 173 104 Z',
]
/**
 * The whole thigh mass: the hamstrings from behind, the quads from the front.
 * The two hip strips below are drawn OVER it rather than carved out of it — the
 * thigh stays one solid mass either way round, with the inner and outer bands
 * simply taking their own color.
 */
const THIGHS = [
  'M82 260 Q72 306 78 352 Q89 357 99 352 Q101 306 103 260 Q92 255 82 260 Z',
  'M138 260 Q148 306 142 352 Q131 357 121 352 Q119 306 117 260 Q128 255 138 260 Z',
]
/** The inner thigh, running the length of the mass. */
const ADDUCTORS = [
  'M103 260 Q101 306 99 352 Q96 355 93 352 Q95 306 96 260 Q100 256 103 260 Z',
  'M117 260 Q119 306 121 352 Q124 355 127 352 Q125 306 124 260 Q120 256 117 260 Z',
]
/** The outer hip, where abduction actually shows — high on the thigh, not down it. */
const ABDUCTORS = [
  'M80 252 Q76 280 77 306 Q81 309 84 306 Q86 278 88 252 Q84 248 80 252 Z',
  'M140 252 Q144 280 143 306 Q139 309 136 306 Q134 278 132 252 Q136 248 140 252 Z',
]
/** Both cheeks, filling the pelvis on the back view. */
const GLUTES = [
  'M88 218 Q79 226 80 244 Q86 258 97 255 Q107 248 106 234 Q100 220 88 218 Z',
  'M132 218 Q141 226 140 244 Q134 258 123 255 Q113 248 114 234 Q120 220 132 218 Z',
]
const CALVES = [
  'M80 372 Q79 402 84 434 Q88 437 92 434 Q97 402 95 372 Q88 367 80 372 Z',
  'M140 372 Q141 402 136 434 Q132 437 128 434 Q123 402 125 372 Q132 367 140 372 Z',
]
const PECS = [
  'M71 92 Q86 81 107 88 Q109 105 107 121 Q86 131 74 117 Q66 105 71 92 Z',
  'M149 92 Q134 81 113 88 Q111 105 113 121 Q134 131 146 117 Q154 105 149 92 Z',
]
/**
 * Starts below the rib cage, not at the pec line — the gap is where the ribs are —
 * and runs down past the navel to the V of the lower abs at the groin.
 */
const ABS = [
  'M95 144 Q110 139 125 144 Q132 172 127 208 Q124 234 116 246 Q110 250 104 246 Q96 234 93 208 Q88 172 95 144 Z',
]
/*
 * Both neck regions run up past the jaw to y=55, well inside the skull, so no
 * sliver of base color shows at the corners where the jaw curves away. The head
 * is drawn over them, which is what keeps the face in front of the neck.
 */
const NECK_FRONT = ['M101 55 Q110 59 119 55 Q120 70 119 74 Q116 80 110 80 Q104 80 101 74 Q100 70 101 55 Z']
/** Neck + the upper-trap yoke it feeds — what neck extension actually changes. */
const NECK_BACK = [
  'M101 55 Q110 59 119 55 Q120 69 119 76 Q128 80 130 93 Q121 87 110 87 Q99 87 90 93 Q92 80 101 76 Q100 69 101 55 Z',
]
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
          strokeLinejoin="round"
          className="motion-safe:transition-[fill] motion-safe:duration-500"
        >
          <title>{titleFor(muscle, score)}</title>
        </path>
      ))}
    </>
  )
}

const HEAD = 'M110 14 C123 14 130 24 129 37 C128 50 121 62 110 62 C99 62 92 50 91 37 C90 24 97 14 110 14 Z'

/**
 * The neutral silhouette both views draw their regions on. The head is drawn
 * last, over the regions, because the neck runs up behind the jaw — from the
 * front the face has to sit in front of it, and from the back the skull does.
 * Anything in `face` goes on top of the head.
 */
function Silhouette({ label, face, children }: { label: string; face?: ReactNode; children: ReactNode }) {
  const bodyFill = { fill: BODY_BASE, stroke: '#3f3f46', strokeWidth: 1.5 } as const
  return (
    <figure className="flex items-center justify-center">
      <svg viewBox="0 0 220 470" className="h-auto w-full" role="img" aria-label={`${label} muscle map`}>
        {/* Neck, torso, arms, hands, pelvis, legs, feet. */}
        <g {...bodyFill} strokeLinejoin="round" strokeLinecap="round">
          <path d="M101 52 C100 66 98 76 94 82 Q110 88 126 82 C122 76 120 66 119 52 Z" />
          <path d="M70 78 Q110 66 150 78 C157 100 156 130 145 152 C141 180 137 199 132 214 Q110 221 88 214 C83 199 79 180 75 152 C64 130 63 100 70 78 Z" />
          <path d="M74 82 C56 82 45 96 43 116 C42 140 43 166 45 190 C46 214 49 234 55 252 Q62 255 70 250 C64 230 63 204 66 180 C68 158 69 136 71 118 C72 102 74 92 78 86 Z" />
          <path d="M146 82 C164 82 175 96 177 116 C178 140 177 166 175 190 C174 214 171 234 165 252 Q158 255 150 250 C156 230 157 204 154 180 C152 158 151 136 149 118 C148 102 146 92 142 86 Z" />
          <path d="M53 245 Q60 243 67 246 Q71 261 64 271 Q55 276 51 266 Q48 254 53 245 Z" />
          <path d="M167 245 Q160 243 153 246 Q149 261 156 271 Q165 276 169 266 Q172 254 167 245 Z" />
          <path d="M88 212 Q110 206 132 212 Q143 234 141 258 Q110 266 79 258 Q77 234 88 212 Z" />
          <path d="M80 252 C70 286 70 330 76 364 C78 392 81 420 83 446 Q89 451 94 446 C96 418 97 390 98 362 C102 322 105 286 107 252 Z" />
          <path d="M140 252 C150 286 150 330 144 364 C142 392 139 420 137 446 Q131 451 126 446 C124 418 123 390 122 362 C118 322 115 286 113 252 Z" />
          <path d="M83 440 Q90 437 96 441 Q99 452 95 459 Q83 462 73 458 Q70 447 83 440 Z" />
          <path d="M137 440 Q130 437 124 441 Q121 452 125 459 Q137 462 147 458 Q150 447 137 440 Z" />
        </g>
        {children}
        <path {...bodyFill} strokeLinejoin="round" d={HEAD} />
        {face}
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
      <path d="M110 152 Q112 183 110 214" />
      <path d="M94 172 Q110 176 126 172" />
      <path d="M95 194 Q110 198 125 194" />
      <path d="M98 214 Q110 218 122 214" />
    </g>
  )
}

function FrontView({ scores, sixPack }: { scores: Record<Muscle, MuscleScore>; sixPack: boolean }) {
  return (
    <Silhouette
      label="front"
      /* The only thing telling the two views apart. */
      face={
        <g fill={NO_DATA}>
          <ellipse cx="102" cy="34" rx="2.6" ry="3" />
          <ellipse cx="118" cy="34" rx="2.6" ry="3" />
        </g>
      }
    >
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
      // Every session, not just the slot that trains the lift freshest (see
      // progress.SlotScope). The lead-slot read exists to stop a chart line
      // sawtoothing; a best-ever is a maximum, and a press done second is still a
      // press that was done — dropping it would understate a band the log earned.
      const series = exerciseSeries(workouts, key, metric, 'all')
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
                  log a weighted lift (leg press, bench, press) to see my strength level.
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
