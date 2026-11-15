import { useState } from 'react'

/**
 * The deployed app's address, to hand to a new phone or a new person. Fixed to
 * the Pages URL rather than read off `location`, so a copy taken from the dev
 * server still points somewhere a stranger's phone can open and install.
 */
export const INSTALL_URL = 'https://chase-grey.github.io/workout-tracker/'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older iOS webviews and non-secure origins have no async clipboard.
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    el.remove()
    return ok
  }
}

export function InstallLink() {
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const copy = async () => {
    if (!(await copyText(INSTALL_URL))) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const share = () => {
    // A dismissed share sheet rejects; that's the user changing their mind.
    navigator.share({ title: 'Workout Tracker', url: INSTALL_URL }).catch(() => {})
  }

  return (
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-300">share the app</label>
      <a
        href={INSTALL_URL}
        target="_blank"
        rel="noreferrer"
        className="break-all rounded-xl bg-surface px-3 py-3 font-mono text-xs text-accent-2"
      >
        {INSTALL_URL.replace(/^https:\/\//, '')}
      </a>
      <div className="flex gap-2">
        <button
          onClick={() => void copy()}
          className="min-h-[44px] flex-1 rounded-xl bg-surface font-medium active:bg-surface-2"
        >
          {copied ? 'copied ✓' : 'copy link'}
        </button>
        {canShare && (
          <button
            onClick={share}
            className="min-h-[44px] flex-1 rounded-xl bg-surface font-medium active:bg-surface-2"
          >
            share
          </button>
        )}
      </div>
    </section>
  )
}
