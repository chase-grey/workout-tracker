import { MdClose, MdInstallMobile } from 'react-icons/md'
import { useInstallPrompt } from '../lib/useInstallPrompt'
import { InstallSteps } from './InstallSteps'

/** Offers installing the app to the home screen, until it's installed or waved off. */
export function InstallBanner() {
  const { offer, install, dismiss } = useInstallPrompt()
  if (!offer) return null
  return (
    <div className="flex min-h-[52px] items-stretch border-t border-border bg-surface">
      {offer === 'prompt' ? (
        <button
          onClick={() => void install()}
          className="flex flex-1 items-center justify-center gap-2 bg-accent text-base font-bold text-on-accent active:opacity-80"
        >
          <MdInstallMobile className="text-xl" aria-hidden />
          install app
        </button>
      ) : (
        <InstallSteps compact />
      )}
      <button
        onClick={dismiss}
        aria-label="dismiss"
        className="px-4 text-xl text-neutral-400 active:opacity-60"
      >
        <MdClose aria-hidden />
      </button>
    </div>
  )
}
