import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { api } from '../../services/api'
import { storage, type Settings } from '../../services/storage'
import { providerOf } from '../../lib/aiProvider'
import { DEFAULT_STRENGTH, planFor } from '../../config/planTemplates'
import { Welcome, type WelcomeResult } from './Welcome'
import { stashCoachKickoff } from '../../lib/coachKickoff'
import { stashResumeTab } from '../../lib/resumeTab'
import { SHELL_PAD_TOP, SHELL_PAD_X, SHELL_WIDTH } from '../../lib/shell'
import { credentialFromText } from '../../lib/signInLink'
import { useSignIn } from './SignInLanding'
import { InstallSteps } from '../../components/InstallSteps'

/**
 * Whether this is an iPhone or iPad showing the app in a Safari tab rather than
 * from the home screen. iOS gives an installed app its own storage, separate
 * from the browser's: an account set up in the tab is not there when the icon is
 * opened.
 */
function inIosBrowserTab(): boolean {
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac; a Mac has no touch points.
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1)
  const standalone =
    (navigator as { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  return ios && !standalone
}

/** Drop an `?invite=` left by an older share link: accounts no longer need one. */
function clearInviteFromUrl() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('invite')) return
  url.searchParams.delete('invite')
  window.history.replaceState(null, '', url.toString())
}

/**
 * The welcome flow, wired to the account it sets up.
 *
 * Shown in place of the app on a device that has never chosen how to store its
 * data (see lib/account). Nothing leaves the device until this finishes: the
 * account is made or signed into first, and only then is the mode saved that
 * lets the outbox and the sync run.
 */
export function WelcomeGate() {
  const { updateSettings, updatePlan, logBodyWeight, signInToAccount } = useData()
  const signIn = useSignIn()
  // On iOS the app is installed before it is set up, or the setup is lost (see
  // inIosBrowserTab). The one screen in the app that tells you how to do
  // something, because nothing on it could be a control that does it for you.
  const [installFirst, setInstallFirst] = useState(inIosBrowserTab)

  const finish = async (r: WelcomeResult) => {
    const base = storage.loadSettings()
    const coach: Partial<Settings> = r.ai
      ? {
          coachEnabled: true,
          aiProvider: r.ai.provider,
          openAiKey: r.ai.key.trim(),
          openAiModel: providerOf(r.ai.provider).defaultModel,
        }
      : {}

    // An existing account brings its own profile, plan and history down with
    // the first sync, so nothing typed into the form is saved over them — and
    // nothing of this blank device is pushed up first (see signInToAccount).
    if (r.account.kind === 'signin') {
      const typed = r.account.email.trim()
      if (/^https?:\/\//i.test(typed)) {
        const cred = credentialFromText(typed)
        if (!cred) throw new Error("That link doesn't sign in")
        await signIn(cred, coach)
      } else {
        const who = await api.login(typed, r.account.password)
        await signInToAccount({ ...coach, accountMode: 'hosted', accountToken: who.token, accountName: who.name })
      }
      clearInviteFromUrl()
      return
    }

    // With a coach to hand, setup ends in a conversation rather than on a
    // template: the app opens on the coach with the request already typed.
    // Stashed before the settings save below, which is what swaps this screen
    // for the app.
    const kickOff = () => {
      if (!r.ai) return
      stashCoachKickoff('plan my week')
      stashResumeTab('coach')
    }

    const made = await api.register(r.account.email.trim(), r.account.password, r.profile.name)
    const account: Partial<Settings> = { accountMode: 'hosted', accountToken: made.token, accountName: made.name }
    kickOff()
    updateSettings({
      ...base,
      ...coach,
      ...account,
      profile: r.profile,
      guideMode: true,
      setupComplete: true,
      ...(r.heightIn != null && { heightIn: r.heightIn }),
    })
    clearInviteFromUrl()
    // Always a starter plan, even with strength switched off: the plan a device
    // falls back to otherwise is the owner's own programme, which would be
    // waiting for them the day they switched strength on. Built from the plan
    // answers when there are some (see lib/planBuilder).
    updatePlan(planFor(r.profile.strength ?? DEFAULT_STRENGTH))
    if (r.weightLbs != null) void logBodyWeight(r.weightLbs)
  }

  if (installFirst) {
    return (
      <div className="app-shell overflow-y-auto">
        <div className={`flex min-h-full flex-col bg-bg ${SHELL_WIDTH} w-full ${SHELL_PAD_X} ${SHELL_PAD_TOP}`}>
          <h1 className="mb-6 mt-2 text-2xl font-bold">install first</h1>
          <InstallSteps />
          <button
            type="button"
            onClick={() => setInstallFirst(false)}
            className="mb-[calc(1rem+env(safe-area-inset-bottom))] min-h-[44px] w-full rounded-xl text-sm font-medium text-neutral-400"
          >
            continue in the browser
          </button>
        </div>
      </div>
    )
  }

  // Inside the same shell the app uses, so the page is the one thing that
  // scrolls and it shrinks with the keyboard the way every other screen does.
  return (
    <div className="app-shell overflow-y-auto">
      <Welcome onFinish={finish} />
    </div>
  )
}
