import { useCallback, useEffect, useRef, useState } from 'react'
import { MdInstallMobile, MdIosShare } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { api } from '../../services/api'
import type { Settings } from '../../services/storage'
import { copyText } from '../../lib/clipboard'
import { isIOS } from '../../lib/installPrompt'
import { useInstallPrompt } from '../../lib/useInstallPrompt'
import { stashResumeTab } from '../../lib/resumeTab'
import { SHELL_PAD_TOP, SHELL_PAD_X, SHELL_WIDTH } from '../../lib/shell'
import {
  credentialFromHash,
  isHandheld,
  signInLanding,
  signInLink,
  withoutCredential,
  type SignInCredential,
} from '../../lib/signInLink'

/**
 * The credential a sign-in link carried (see lib/signInLink), taken out of the
 * address bar as it's read so it isn't left sitting there, or in the history.
 */
export function takeCredentialFromUrl(): SignInCredential | undefined {
  const cred = credentialFromHash(window.location.hash)
  if (cred) window.history.replaceState(null, '', withoutCredential(window.location.href))
  return cred
}

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

/**
 * Check a credential with the backend, then take the account over. A key is a
 * hosted account; the owner secret makes this one of the owner's own devices,
 * which reach the backend with no key at all.
 */
export function useSignIn() {
  const { signInToAccount } = useData()
  return useCallback(
    async (cred: SignInCredential, extra: Partial<Settings> = {}) => {
      if (cred.kind === 'key') {
        const who = await api.account(cred.key)
        await signInToAccount({ ...extra, accountMode: 'hosted', accountToken: cred.key, accountName: who.name })
      } else {
        await api.checkOwnerSecret(cred.secret)
        await signInToAccount({ ...extra, accountMode: 'legacy', chatToken: cred.secret })
      }
    },
    [signInToAccount],
  )
}

const PRIMARY = 'min-h-[48px] w-full rounded-xl bg-accent font-semibold text-on-accent disabled:opacity-50'
const SECONDARY = 'min-h-[44px] w-full rounded-xl text-sm font-medium text-neutral-400 disabled:opacity-50'

/**
 * Where a scanned sign-in link opens, ahead of the app on any device — one
 * already set up included, since the link says who the device is to be now.
 *
 * Signing in starts at once. On a laptop, or in the installed app, that's all
 * there is, and the app opens on Today. A phone or tablet still in a browser
 * tab gets a welcome that puts the home screen first: on Android the browser's
 * storage is the installed app's, so the sign-in already done goes with it; an
 * iPhone gives the installed app storage of its own, so the link is copied to
 * be pasted there.
 */
export function SignInLanding({ cred, onDone }: { cred: SignInCredential; onDone: () => void }) {
  const signIn = useSignIn()
  const { settings } = useData()
  const { offer, install } = useInstallPrompt()
  const [landing] = useState(() =>
    signInLanding({ handheld: isHandheld(navigator.userAgent, navigator.maxTouchPoints), standalone: standalone() }),
  )
  const ios = isIOS(navigator.userAgent, navigator.maxTouchPoints)
  const [status, setStatus] = useState<'pending' | 'done' | 'error'>('pending')
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Open on Today. A session left on this device goes behind its "back to"
  // pill rather than over the screen (see AppShell's resumed tab).
  const done = useCallback(() => {
    stashResumeTab('today')
    onDone()
  }, [onDone])

  const run = useCallback(async () => {
    setStatus('pending')
    setError(null)
    try {
      await signIn(cred)
      setStatus('done')
      if (landing === 'today') done()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'something went wrong')
      setStatus('error')
    }
  }, [signIn, cred, landing, done])

  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    void run()
  }, [run])

  const name = settings.profile?.name?.trim() || settings.accountName?.trim()

  return (
    <div className="app-shell overflow-y-auto">
      <div className={`flex min-h-full flex-col bg-bg ${SHELL_WIDTH} w-full ${SHELL_PAD_X} ${SHELL_PAD_TOP}`}>
        <h1 className="mb-6 mt-2 text-2xl font-bold">
          {landing === 'today' ? 'signing in…' : name && status === 'done' ? `welcome, ${name}` : 'welcome'}
        </h1>

        {landing === 'install' && (
          <div className="flex flex-1 flex-col gap-4">
            {ios ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    void copyText(signInLink(`${location.origin}${location.pathname}`, cred)).then(
                      (ok) => ok && setCopied(true),
                    )
                  }}
                  className={PRIMARY}
                >
                  {copied ? 'copied ✓' : 'copy sign-in link'}
                </button>
                <ol className="flex list-decimal flex-col gap-3 pl-5 text-base text-neutral-300">
                  <li>
                    tap share <MdIosShare className="inline text-lg" aria-hidden />
                  </li>
                  <li>add to home screen</li>
                  <li>open workout tracker from the home screen</li>
                  <li>i already have an account → paste</li>
                </ol>
              </>
            ) : offer === 'prompt' ? (
              <button
                type="button"
                onClick={() => void install()}
                className={`${PRIMARY} flex items-center justify-center gap-2`}
              >
                <MdInstallMobile className="text-xl" aria-hidden />
                install app
              </button>
            ) : null}
          </div>
        )}

        {landing === 'today' && <div className="flex-1" />}

        <div className="mb-[calc(1rem+env(safe-area-inset-bottom))] flex flex-col gap-2">
          {error && (
            <p role="alert" className="text-sm text-red-400">
              {error}
            </p>
          )}
          {status === 'error' && (
            <button type="button" onClick={() => void run()} className={PRIMARY}>
              try again
            </button>
          )}
          {landing === 'install' && (
            <button type="button" onClick={done} disabled={status === 'pending'} className={SECONDARY}>
              {status === 'pending' ? 'signing in…' : 'continue in the browser'}
            </button>
          )}
          {status === 'error' && (
            <button type="button" onClick={onDone} className={SECONDARY}>
              not now
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
