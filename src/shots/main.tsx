import { type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import '../index.css'
import { CountdownShape, RestTimer } from '../components/RestTimer'
import { RhythmGuide } from '../components/RhythmGuide'
import { SessionProgress } from '../components/SessionProgress'
import { REST_BOX_VARIANTS, REST_VARIANTS, type RestVariant } from '../lib/restShapes'
import { RHYTHM_FAMILIES, type RhythmVariant } from '../lib/rhythmVariant'
import { SHELL_PAD_TOP, SHELL_PAD_X, SHELL_WIDTH } from '../lib/shell'
import { initTheme } from '../lib/themeStore'
import { CelebrationProvider } from '../store/CelebrationContext'
import { DataProvider } from '../store/DataContext'
import { advance, installClock, painted } from './clock'
import { seededData, writeData, type ShotData } from './seed'

/**
 * The page `npm run shots` drives (scripts/shots.mjs): every rhythm figure,
 * hold shape and rest shape, one at a time, at a named moment, inside the same
 * markup a session puts around it. It is a dev-server page only; the build
 * never sees it.
 *
 * It can be opened by hand too, on any browser the dev server reaches, the
 * phone included: /shots.html#rhythm/anvil/closing shows that one shot.
 *
 * The list of shots is built from the same arrays the rotations draw from, so a
 * new figure is in the next run without anyone adding it here. What is written
 * here is the moments worth looking at, per family: a push, the rest after it,
 * the white arriving, and the closing rep, which is white from its first frame
 * on a set that ends itself.
 */

type Moment = {
  /** The column this shot goes in on the contact sheet. */
  phase: string
  /** The rep the guide mounts on, as a session resuming there would. */
  startRep: number
  /** Seconds into that rep. */
  at: number
}

type RhythmFamily = keyof typeof RHYTHM_FAMILIES

const RHYTHM_SETS: Record<RhythmFamily, {
  title: string
  tempo: string
  reps: number
  forwardBack?: boolean
  skipFinalRepRest?: boolean
  moments: Moment[]
}> = {
  breathe: {
    title: "tailor's pose",
    tempo: '2s down · 3s hold at bottom · 1s up',
    reps: 5,
    moments: [
      { phase: 'push', startRep: 1, at: 1.2 },
      { phase: 'hold', startRep: 1, at: 3.5 },
      { phase: 'white arriving', startRep: 4, at: 6.45 },
      { phase: 'closing', startRep: 5, at: 3.5 },
    ],
  },
  descent: {
    title: 'pike block crush',
    tempo: '10s press down · 5s rest',
    reps: 3,
    skipFinalRepRest: true,
    moments: [
      { phase: 'push', startRep: 1, at: 5 },
      { phase: 'rest', startRep: 1, at: 12.5 },
      { phase: 'white arriving', startRep: 2, at: 10.45 },
      { phase: 'closing rest', startRep: 2, at: 12.5 },
      { phase: 'closing', startRep: 3, at: 5 },
    ],
  },
  pushpull: {
    title: 'pike lift',
    tempo: '5s press down · 5s rest · 5s pull up · 5s rest',
    reps: 5,
    skipFinalRepRest: true,
    moments: [
      { phase: 'push', startRep: 1, at: 2.5 },
      { phase: 'rest', startRep: 1, at: 7.5 },
      { phase: 'pull', startRep: 1, at: 12.5 },
      { phase: 'white arriving', startRep: 4, at: 15.45 },
      { phase: 'closing rest', startRep: 4, at: 17.5 },
      { phase: 'closing', startRep: 5, at: 2.5 },
      { phase: 'closing pull', startRep: 5, at: 12.5 },
    ],
  },
  floss: {
    title: 'sciatic nerve floss',
    tempo: '3s forward · 3s back',
    reps: 8,
    forwardBack: true,
    moments: [
      { phase: 'forward', startRep: 1, at: 1.5 },
      { phase: 'turn', startRep: 1, at: 3 },
      { phase: 'back', startRep: 1, at: 4.5 },
      { phase: 'white arriving', startRep: 7, at: 6.45 },
      { phase: 'closing', startRep: 8, at: 1.5 },
    ],
  },
}

/** How much of a hold or a rest is left: just begun, half gone, nearly out. */
const LEVELS = [
  { phase: 'full', fraction: 0.92 },
  { phase: 'half', fraction: 0.5 },
  { phase: 'nearly out', fraction: 0.07 },
]
/** Seconds the shapes with a simulation in them (sand, drips, bubbles) run before the shot. */
const SHAPE_WARMUP_SEC = 2.5
const REST_SEC = 90

type Shot = {
  /** `family/variant/phase`, which is also the page's hash and the file's path. */
  id: string
  family: 'rhythm' | 'hold' | 'rest'
  /** The row on the contact sheet: one figure or shape. */
  variant: string
  /** Sub-heading the rows sit under, for the rhythm families. */
  group: string
  phase: string
  render: () => ReactNode
  /** Seconds to wind the clock on after mounting. */
  wind: number
}

const slug = (s: string) => s.replace(/\s+/g, '-')

/** The top of a session screen, without its controls: those need the app's data. */
function TopBar({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-col gap-3">
      <SessionProgress done={7} total={18} unit="sets" timeLeftLabel="12 min left" />
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-3xl font-bold leading-tight">{title}</h2>
          <p className="mt-1 text-lg font-medium text-neutral-400">{detail}</p>
        </div>
      </header>
    </div>
  )
}

/** The app shell and the stretch session's root, as App and StretchSession lay them out. */
function SessionScreen({ children }: { children: ReactNode }) {
  return (
    <div className={`app-shell flex flex-col ${SHELL_WIDTH}`}>
      <main className={`min-h-0 flex-1 overflow-y-auto pb-4 ${SHELL_PAD_X} ${SHELL_PAD_TOP}`}>
        <div className="session-type stretch-session flex min-h-full flex-col gap-3">{children}</div>
      </main>
    </div>
  )
}

function buildShots(): Shot[] {
  const shots: Shot[] = []

  for (const family of Object.keys(RHYTHM_FAMILIES) as RhythmFamily[]) {
    const set = RHYTHM_SETS[family]
    for (const variant of RHYTHM_FAMILIES[family] as readonly RhythmVariant[]) {
      for (const moment of set.moments) {
        shots.push({
          id: `rhythm/${variant}/${slug(moment.phase)}`,
          family: 'rhythm',
          variant,
          group: family,
          phase: moment.phase,
          wind: moment.at,
          render: () => (
            <SessionScreen>
              <TopBar title={set.title} detail={`rep ${moment.startRep} of ${set.reps}`} />
              <RhythmGuide
                tempo={set.tempo}
                reps={set.reps}
                variant={variant}
                startRep={moment.startRep}
                forwardBack={set.forwardBack}
                skipFinalRepRest={set.skipFinalRepRest}
                endsOnTarget
              />
            </SessionScreen>
          ),
        })
      }
    }
  }

  // A hold's countdown, in the markup components/HoldTimer wraps it in.
  for (const variant of REST_BOX_VARIANTS) {
    for (const level of LEVELS) {
      shots.push({
        id: `hold/${variant}/${slug(level.phase)}`,
        family: 'hold',
        variant,
        group: 'hold',
        phase: level.phase,
        wind: SHAPE_WARMUP_SEC,
        render: () => (
          <SessionScreen>
            <TopBar title="calf stretch" detail="left foot · foot straight" />
            <div className="hold-timer flex flex-col items-center gap-3">
              <div className="hold-visual">
                <CountdownShape fraction={level.fraction} variant={variant} />
              </div>
            </div>
          </SessionScreen>
        ),
      })
    }
  }

  for (const variant of REST_VARIANTS as readonly RestVariant[]) {
    for (const level of LEVELS) {
      shots.push({
        id: `rest/${variant}/${slug(level.phase)}`,
        family: 'rest',
        variant,
        group: 'rest',
        phase: level.phase,
        wind: SHAPE_WARMUP_SEC,
        render: () => (
          <SessionScreen>
            <RestTimer
              seconds={REST_SEC}
              endsAt={Date.now() + level.fraction * REST_SEC * 1000}
              variant={variant}
              header={<TopBar title="incline bench press" detail="set 3 of 4" />}
              upNextTarget="80 × 8"
              onClose={() => {}}
            />
          </SessionScreen>
        ),
      })
    }
  }

  return shots
}

installClock()
initTheme()

const shots = buildShots()
const root = createRoot(document.getElementById('root')!)

async function show(id: string): Promise<boolean> {
  const shot = shots.find((s) => s.id === id)
  flushSync(() => root.render(null))
  if (!shot) return false
  // Inside the app's own providers: the session's pieces read their labels and
  // settings from them. They sync with a closed local port, which is nothing.
  flushSync(() =>
    root.render(
      <CelebrationProvider key={id}>
        <DataProvider>{shot.render()}</DataProvider>
      </CelebrationProvider>,
    ),
  )
  advance(shot.wind * 1000)
  await painted(150)
  return true
}

declare global {
  interface Window {
    __shots: {
      list: () => Pick<Shot, 'id' | 'family' | 'variant' | 'group' | 'phase'>[]
      show: (id: string) => Promise<boolean>
      /** Seed the app's storage: a snapshot if one is handed over, else the made-up history. */
      seed: (data: ShotData | null, mode: 'dark' | 'light') => 'snapshot' | 'seeded'
    }
  }
}

window.__shots = {
  list: () => shots.map(({ id, family, variant, group, phase }) => ({ id, family, variant, group, phase })),
  show,
  seed: (data, mode) => {
    writeData(data ?? seededData(), mode)
    return data ? 'snapshot' : 'seeded'
  },
}

const fromHash = () => {
  const id = decodeURIComponent(location.hash.slice(1))
  if (id) void show(id)
}
window.addEventListener('hashchange', fromHash)
fromHash()
