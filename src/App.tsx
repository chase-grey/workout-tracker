import { useEffect, useRef, useState } from 'react'
import {
  DataProvider,
  useData,
  type StretchFinishSummary,
  type WorkoutFinishSummary,
} from './store/DataContext'
import { CelebrationProvider, useCelebrate } from './store/CelebrationContext'
import { BottomNav, tabsShown, type Tab } from './components/BottomNav'
import { InstallBanner } from './components/InstallBanner'
import { ReviewOverlay } from './components/ReviewOverlay'
import { WorkoutFinishOverlay } from './components/WorkoutFinishOverlay'
import { StretchFinishOverlay } from './components/StretchFinishOverlay'
import { UpdateToast } from './components/UpdateToast'
import { useAppUpdate } from './lib/version'
import { buildReview, monthKeyOf, pendingReview, yearKeyOf, type Review } from './lib/review'
import { TodayTab } from './features/today/TodayTab'
import { CalendarSync } from './features/today/CalendarSync'
import { ProgressTab } from './features/progress/ProgressTab'
import { ChatTab } from './features/chat/ChatTab'
import { SettingsTab } from './features/settings/SettingsTab'
import { ActiveSession } from './features/today/ActiveSession'
import { useActiveSession } from './features/today/useActiveSession'
import { StretchSession } from './features/flex/StretchSession'
import { storage } from './services/storage'
import { useTrackedIssues } from './store/useTrackedIssues'
import { issuesAwaitingAnswer } from './services/issues'
import { useBackGuard } from './lib/useBackGuard'
import { noteScreen } from './services/screenWatch'
import { takeResumeTab } from './lib/resumeTab'
import { useKeyboardOpen } from './lib/useKeyboardOpen'
import { keyboardCoversPage } from './lib/viewport'
import { useScreenMove } from './lib/useScreenMove'
import { SHELL_PAD_TOP, SHELL_PAD_X, SHELL_WIDTH } from './lib/shell'
import { MdFitnessCenter } from 'react-icons/md'
import { nextStretchSide } from './lib/stretchSide'
import type { FlexRoutineKey } from './config/flexRoutines'
import type { DayType } from './types'
import type { VariantKey } from './config/plan'
import { WelcomeGate } from './features/setup/WelcomeGate'
import { SignInLanding, takeCredentialFromUrl } from './features/setup/SignInLanding'
import { isSignedInAs } from './lib/signInLink'
import { accountModeOf, needsAccount } from './lib/account'
import { AccountGate } from './features/setup/AccountGate'

// A device in use before accounts existed never chose how to store its data.
// Settle it as the owner's before anything renders, so it goes on syncing as it
// always has; a device with nothing on it is left unset and gets the welcome
// flow instead (see lib/account).
{
  const s = storage.loadSettings()
  if (!s.accountMode) {
    const mode = accountModeOf(s, {
      workouts: storage.loadWorkouts().length,
      bodyWeights: storage.loadBodyWeights().length,
      calories: storage.loadCalories().length,
      flex: storage.loadFlex().length,
    })
    if (mode) storage.saveSettings({ ...s, accountMode: mode })
  }
}

export default function App() {
  return (
    <CelebrationProvider>
      <DataProvider>
        <Gate />
      </DataProvider>
    </CelebrationProvider>
  )
}

/**
 * A scanned sign-in link first, on any device it isn't already the account
 * of; then the welcome flow until this device has an account mode; then, for
 * a device from before every device needed one, an account; the app after.
 */
function Gate() {
  const { settings } = useData()
  const [cred, setCred] = useState(() => {
    const c = takeCredentialFromUrl()
    return c && !isSignedInAs(storage.loadSettings(), c) ? c : undefined
  })
  if (cred) return <SignInLanding cred={cred} onDone={() => setCred(undefined)} />
  if (!settings.accountMode) return <WelcomeGate />
  if (needsAccount(settings)) return <AccountGate />
  return (
    <>
      <CalendarSync />
      <AppShell />
    </>
  )
}

/** Running as the installed app, where back has no page behind this one to go to. */
const INSTALLED =
  typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches

function AppShell() {
  // A reload the app kicked off itself (the update check) picks its own landing
  // tab; everything else starts on Today.
  const [resumedTab] = useState(takeResumeTab)
  const [tab, setTab] = useState<Tab>(resumedTab ?? 'today')
  const mainRef = useRef<HTMLElement>(null)
  const { saveSession, settings, updateSettings, saveError } = useData()
  // The coach waits to be switched on in Settings, which is where its key gets
  // typed too — on every device alike. A dev build still reaches the proxy's
  // Epic key without one, but it flips the same switch to get the tab.
  const showChat = settings.coachEnabled === true
  const { celebrate } = useCelebrate()
  const controls = useActiveSession()
  // Which stretch routine is on screen, or null for none. A session restored from
  // storage that predates the two routines was necessarily a side split.
  const [stretching, setStretching] = useState<FlexRoutineKey | null>(() => {
    const saved = storage.loadStretch()
    return saved ? saved.routine ?? 'side_split' : null
  })
  const [review, setReview] = useState<Review | null>(null)
  const [finishSummary, setFinishSummary] = useState<WorkoutFinishSummary | null>(null)
  const [stretchSummary, setStretchSummary] = useState<StretchFinishSummary | null>(null)
  // A session set aside — the rest of the app is usable while it keeps running.
  // The session stays mounted (just hidden), so its rest timer, rep pace and
  // elapsed-time accounting carry on untouched until you jump back in.
  // A reload that asked for a tab starts with the restored session set aside:
  // the full-screen session would otherwise cover the tab you came back for,
  // which reads as the update check throwing you into your workout.
  const [minimized, setMinimized] = useState(resumedTab != null)
  const sessionActive = controls.session != null || stretching != null
  // Filed issues, polled app-wide rather than only while Settings is open: the
  // point of the dot is to tell you a question is waiting when you weren't
  // looking for one. Settings reads the same shared list.
  const { issues, failed: issuesFailed } = useTrackedIssues(settings.chatToken.trim().length > 0)
  const awaiting = issuesAwaitingAnswer(issues)
  // Opening Settings acknowledges a save failure: its card says the rest, so the
  // dot stops nagging while saves keep failing. A save that goes through clears
  // the error, and the next failure earns the dot again.
  const [saveErrorSeen, setSaveErrorSeen] = useState(false)
  useEffect(() => {
    if (!saveError) setSaveErrorSeen(false)
    else if (tab === 'settings') setSaveErrorSeen(true)
  }, [saveError, tab])
  // The issue whose question the coach tab is currently taking an answer for.
  const [answering, setAnswering] = useState<number | null>(null)
  // A newer build is ready: the dot stays until you restart onto it, the way an
  // app store badge does — it's a thing to do, not a thing to have seen.
  const { ready: updateReady } = useAppUpdate()
  const keyboardOpen = useKeyboardOpen()

  // Scroll back to the top when switching tabs.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [tab])

  // A finished/discarded session leaves nothing to jump back into.
  useEffect(() => {
    if (!sessionActive) setMinimized(false)
  }, [sessionActive])

  // Android back — the button or the edge swipe — sets the session aside rather
  // than leaving the app, and the workout keeps running behind the tabs. It's the
  // only way out of a session screen short of finishing one, so the overflow menu
  // carries no "back" of its own; browser back does the same on a desktop.
  // A sheet opened over the session claims the press while it is up, and closing
  // it is all that press does (see useBackGuard); so does a session with a step
  // of its own to take back — the rest a tap just cut short (see lib/leftRest).
  useBackGuard(sessionActive && !minimized, () => setMinimized(true))

  // The press nothing else claims. With no entry of ours under it, back walks
  // out of the document, and the installed app has nowhere to go: Firefox on
  // Android leaves its window standing on the empty page it opened with, a grey
  // screen that isn't ours to draw on or to report from. So the installed app
  // always holds one entry, and back at the bottom of everything goes to Today
  // and then stays there; leaving is the home gesture. A browser tab keeps its
  // back button: there the page before this one is somewhere real.
  useBackGuard(
    INSTALLED,
    () => {
      setTab('today')
      mainRef.current?.scrollTo({ top: 0 })
    },
    { floor: true },
  )

  // Month/year in review, once per new period. On the feature's first run the
  // markers are unset — seed them to the current period so we never backfill a
  // surprise recap; from then on a recap shows on the first open of a new month
  // or year. Reads from storage (the cache is loaded synchronously) so it runs
  // on mount without waiting for the background sync.
  useEffect(() => {
    const s = storage.loadSettings()
    const now = new Date()
    if (s.lastReviewedMonth == null || s.lastReviewedYear == null) {
      updateSettings({ ...s, lastReviewedMonth: monthKeyOf(now), lastReviewedYear: yearKeyOf(now) })
      return
    }
    const data = {
      workouts: storage.loadWorkouts(),
      flexDates: storage.loadFlex().map((f) => f.date),
      flexEntries: storage.loadFlex(),
      calorieEntries: storage.loadCalories(),
      bodyWeights: storage.loadBodyWeights(),
    }
    const pending = pendingReview(s, data, now)
    if (pending) setReview(buildReview(data, pending.kind, pending.periodKey))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dismissReview = () => {
    const s = storage.loadSettings()
    const now = new Date()
    const next = { ...s, lastReviewedMonth: monthKeyOf(now) }
    // A year recap subsumes the month that just closed, so mark both reviewed.
    if (review?.kind === 'year') next.lastReviewedYear = yearKeyOf(now)
    updateSettings(next)
    setReview(null)
  }

  const startStretch = (routine: FlexRoutineKey, officeAbs = false) => {
    if (controls.session) {
      setMinimized(false)
      return
    }
    // A routine already in progress is picked back up rather than restarted, so
    // the button that was tapped doesn't matter — including which routine it was.
    const saved = storage.loadStretch()
    if (saved) {
      setStretching(saved.routine ?? 'side_split')
    } else {
      storage.saveStretch({
        step: 0,
        done: [],
        started: false,
        startSide: nextStretchSide(storage.loadFlex(), routine),
        startedAt: new Date().toISOString(),
        routine,
        core: officeAbs,
        officeAbs,
      })
      setStretching(routine)
    }
    setMinimized(false)
  }

  const startWorkout = (dayType: DayType, variant?: VariantKey) => {
    setMinimized(false)
    if (sessionActive) return
    controls.start(dayType, variant)
  }

  // Workouts and stretches take over the whole screen (no tabs / bottom nav)
  // unless they've been set aside.
  const immersive =
    (sessionActive && !minimized) || finishSummary != null || stretchSummary != null

  // The screen arrives from the side of the bar its tab sits on, a session comes
  // up over the tabs, and the tabs settle back when it leaves (see lib/motion).
  useScreenMove(mainRef, { tab, immersive, session: sessionActive }, tabsShown(showChat))

  // What this shell believes it is showing, for the report a blank screen sends
  // (see services/screenWatch): the phone can't be asked, and the DOM alone
  // doesn't say which of these was meant to be up.
  useEffect(() => {
    noteScreen({
      tab,
      minimized,
      session: controls.session ? 'lift' : stretching ? `stretch:${stretching}` : null,
      recap: finishSummary != null || stretchSummary != null,
      review: review != null,
      coachOn: showChat,
    })
  })

  // The keyboard shrinks the shell, and everything in it rides up — the nav and
  // the back-to-your-workout banner both, which then stack between the composer
  // and the keys taking two rows out of an already short screen. Neither is
  // reachable mid-message anyway, so while the coach's keyboard is up they stand
  // down and only the composer follows it: as far as the eye can tell they've
  // stayed put and the keyboard slid over them. They come back when it goes,
  // measured rather than guessed from focus (see useKeyboardOpen).
  //
  // Where the keyboard is drawn over the page instead (keyboardCoversPage), that
  // is literally what happens: nothing rides up, the keys cover the nav where it
  // stands, and taking it away would only drop the composer a row before it rose.
  const typingToCoach = tab === 'coach' && keyboardOpen && !keyboardCoversPage()

  const dismissFinish = () => {
    const ambient = finishSummary?.ambient ?? null
    setFinishSummary(null)
    setTab('today')
    // Any weekly-goal / all-time-record wins ride in after the recap closes.
    if (ambient) celebrate(ambient)
  }

  // The stretch recap closes the same way, and its ambient wins ride in behind it
  // too — the recap has already said everything about the session itself.
  const dismissStretchFinish = () => {
    const ambient = stretchSummary?.ambient ?? null
    setStretchSummary(null)
    setTab('today')
    if (ambient) celebrate(ambient)
  }

  let session = null
  if (controls.session) {
    session = (
      <ActiveSession
        session={controls.session}
        controls={controls}
        onFinish={(s, duration) => {
          // Show the full-screen recap first, then return to Today on dismiss.
          void saveSession(s, duration).then((summary) => {
            controls.clear()
            setFinishSummary(summary)
          }).catch(() => { /* SaveStatus explains the failure; keep the session. */ })
        }}
      />
    )
  } else if (stretching) {
    session = (
      <StretchSession
        routine={stretching}
        onClose={() => {
          storage.saveStretch(null)
          setStretching(null)
          // A finished routine lands you home, under the recap screen.
          setTab('today')
        }}
        onFinish={setStretchSummary}
      />
    )
  }

  return (
    <div
      className={`app-shell flex flex-col ${SHELL_WIDTH} ${tab === 'coach' ? 'follows-keyboard' : ''}`}
    >
      {/* min-h-0: a flex item's automatic minimum is its own content, which would
          let a tall tab push the nav off the bottom of the shell rather than
          scroll inside it. */}
      <main
        ref={mainRef}
        className={`min-h-0 flex-1 overflow-y-auto pb-4 ${SHELL_PAD_X} ${SHELL_PAD_TOP}`}
      >
        {/* A set-aside session stays mounted, only hidden — its timers, rep pace
            and elapsed-time accounting must not restart when you look away. */}
        {session && <div className={minimized ? 'hidden' : 'contents'}>{session}</div>}
        {(!session || minimized) && (
          <>
            {tab === 'today' && <TodayTab onStart={startWorkout} onStartStretch={startStretch} onStartAbs={() => startStretch('side_split', true)} />}
            {tab === 'progress' && <ProgressTab />}
            {tab === 'coach' && showChat && (
              <ChatTab answering={answering} onAnsweringDone={() => setAnswering(null)} />
            )}
            {tab === 'settings' && (
              <SettingsTab
                issues={issues}
                issuesFailed={issuesFailed}
                onAnswer={(number) => {
                  setAnswering(number)
                  setTab('coach')
                }}
              />
            )}
          </>
        )}
      </main>
      {/* Everything under the scroller, in one box that can be made as tall as a
          keyboard drawn over the page (.shell-foot, index.css): its contents keep
          to its bottom edge, under the keys, and the scroller above gives up the
          difference, which is what carries the composer up. */}
      <div className="shell-foot">
        {minimized && sessionActive && !typingToCoach && (
          <button
            onClick={() => setMinimized(false)}
            className="flex min-h-[52px] items-center justify-center gap-2 border-t border-border bg-accent text-base font-bold text-on-accent active:opacity-80"
          >
            <MdFitnessCenter className="text-xl" aria-hidden />
            {controls.session ? 'back to your workout' : storage.loadStretch()?.officeAbs ? 'back to core' : 'back to your stretch'}
          </button>
        )}
        {!immersive && !typingToCoach && <InstallBanner />}
        {!immersive && !typingToCoach && (
          <BottomNav
            active={tab}
            onChange={setTab}
            showChat={showChat}
            alerts={
              awaiting.length > 0 || (saveError && !saveErrorSeen) || updateReady ? ['settings'] : []
            }
          />
        )}
      </div>
      <UpdateToast />
      {review && <ReviewOverlay review={review} onClose={dismissReview} />}
      {finishSummary && <WorkoutFinishOverlay summary={finishSummary} onClose={dismissFinish} />}
      {stretchSummary && (
        <StretchFinishOverlay summary={stretchSummary} onClose={dismissStretchFinish} />
      )}
    </div>
  )
}
