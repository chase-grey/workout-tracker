import { useEffect, useState } from 'react'
import { useData } from '../../store/DataContext'
import { qrSvg } from '../../lib/qr'
import { copyText } from '../../lib/clipboard'
import { signInLink, type SignInCredential } from '../../lib/signInLink'
import { PressButton, SETTINGS_BUTTON, SETTINGS_LABEL } from './PressButton'

/**
 * The deployed app's address, to hand to a new phone or a new person. Fixed to
 * the Pages URL rather than read off `location`, so a copy taken from the dev
 * server still points somewhere a stranger's phone can open and install.
 */
export const INSTALL_URL = 'https://chase-grey.github.io/workout-tracker/'

type Audience = 'me' | 'new'

/**
 * A QR, a copy and a share for two links. The one that opens first signs
 * another of your own devices into this account, since that's the one you'll
 * reach for most. The plain app link, for someone who wants their own, is a
 * tap away — the sign-in link is the account itself, and handing it to the
 * wrong person shouldn't be the path of least resistance.
 */
export function InstallLink() {
  const { settings } = useData()
  // A hosted account signs in by its key. The owner's account has no key —
  // it's the one a keyless request reaches — so the owner's phones sign each
  // other in with the issue token instead (see lib/signInLink).
  const hostedKey = settings.accountToken?.trim()
  const ownerSecret = settings.chatToken.trim()
  const cred: SignInCredential | null =
    settings.accountMode === 'hosted' && hostedKey
      ? { kind: 'key', key: hostedKey }
      : settings.accountMode === 'legacy' && !settings.apiUrl.trim() && ownerSecret
        ? { kind: 'owner', secret: ownerSecret }
        : null
  const [audience, setAudience] = useState<Audience>('me')
  const showing: Audience = cred ? audience : 'new'
  const link = showing === 'me' && cred ? signInLink(INSTALL_URL, cred) : INSTALL_URL

  const [svg, setSvg] = useState<{ for: string; svg: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    let alive = true
    qrSvg(link)
      .then((s) => alive && setSvg({ for: link, svg: s }))
      .catch(() => {
        /* no QR; the buttons still carry the link */
      })
    return () => {
      alive = false
    }
  }, [link])

  const copy = async () => {
    if (!(await copyText(link))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const share = () => {
    const data =
      showing === 'me'
        ? { title: 'Workout Tracker', url: link }
        : { title: 'Workout Tracker', text: 'try workout tracker', url: link }
    // A dismissed share sheet rejects; that's the user changing their mind.
    navigator.share(data).catch(() => {})
  }

  return (
    <section className="flex flex-col gap-2">
      <label className={SETTINGS_LABEL}>share</label>
      {cred && (
        <div className="flex gap-1 rounded-xl bg-surface p-1">
          {(['me', 'new'] as const).map((a) => (
            <PressButton
              key={a}
              onPress={() => setAudience(a)}
              pressed={showing === a}
              className={`min-h-[36px] flex-1 rounded-lg px-2 text-sm font-medium ${
                showing === a ? 'bg-accent text-on-accent' : 'text-neutral-400'
              }`}
            >
              {a === 'me' ? 'my other devices' : 'someone new'}
            </PressButton>
          ))}
        </div>
      )}
      <div className="flex flex-col items-center gap-3 rounded-xl bg-surface p-4">
        <div
          className="aspect-square w-48 rounded-lg bg-white p-2 [&>svg]:h-full [&>svg]:w-full"
          role="img"
          aria-label={showing === 'me' ? 'sign-in QR code' : 'app QR code'}
          dangerouslySetInnerHTML={{ __html: svg?.for === link ? svg.svg : '' }}
        />
        {showing === 'new' && (
          <span className="break-all text-center font-mono text-xs text-accent-2">
            {INSTALL_URL.replace(/^https:\/\//, '')}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <PressButton onPress={() => void copy()} className={`${SETTINGS_BUTTON} flex-1`}>
          {copied ? 'copied ✓' : 'copy link'}
        </PressButton>
        {canShare && (
          <PressButton onPress={share} className={`${SETTINGS_BUTTON} flex-1`}>
            share
          </PressButton>
        )}
      </div>
    </section>
  )
}
