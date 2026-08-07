import { useEffect, useState } from 'react'

/**
 * TEMPORARY. A readout of what this device thinks its viewport is, so a layout
 * bug that only shows up in the installed app can be diagnosed from numbers
 * rather than guesses. Delete this file and its use in SettingsTab once the
 * bottom-of-the-screen cropping is fixed.
 */

/** Resolve viewport units and safe-area insets the only way CSS exposes them:
 *  put them on an element and read back what the browser computed. */
function probe(): Record<string, number> {
  const el = document.createElement('div')
  el.style.cssText =
    'position:fixed;top:0;left:0;width:0;visibility:hidden;box-sizing:content-box;' +
    'padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom);'
  document.body.appendChild(el)
  const cs = getComputedStyle(el)
  const insetTop = parseFloat(cs.paddingTop) || 0
  const insetBottom = parseFloat(cs.paddingBottom) || 0
  const unit = (value: string) => {
    el.style.height = value
    return Math.round(parseFloat(getComputedStyle(el).height) || 0)
  }
  const out = {
    insetTop: Math.round(insetTop),
    insetBottom: Math.round(insetBottom),
    dvh: unit('100dvh'),
    svh: unit('100svh'),
    lvh: unit('100lvh'),
  }
  el.remove()
  return out
}

function rect(selector: string): string {
  const el = document.querySelector(selector)
  if (!el) return '—'
  const r = el.getBoundingClientRect()
  return `${Math.round(r.top)}→${Math.round(r.bottom)}`
}

/** What the browser resolved a property to, which is the only account of the
 *  cascade that can't be argued with. */
function computed(selector: string, ...props: string[]): string {
  const el = document.querySelector(selector)
  if (!el) return '—'
  const cs = getComputedStyle(el)
  return props.map((p) => cs.getPropertyValue(p).replace(/px$/, '')).join('/')
}

export function ViewportDebug() {
  const [, bump] = useState(0)
  useEffect(() => {
    const onChange = () => bump((n) => n + 1)
    window.addEventListener('resize', onChange)
    window.visualViewport?.addEventListener('resize', onChange)
    window.visualViewport?.addEventListener('scroll', onChange)
    return () => {
      window.removeEventListener('resize', onChange)
      window.visualViewport?.removeEventListener('resize', onChange)
      window.visualViewport?.removeEventListener('scroll', onChange)
    }
  }, [])

  const p = probe()
  const vv = window.visualViewport
  const mode = ['standalone', 'fullscreen', 'minimal-ui', 'browser'].find((m) =>
    window.matchMedia(`(display-mode: ${m})`).matches,
  )
  const root = document.documentElement

  return (
    <p className="font-mono text-[11px] leading-relaxed text-neutral-400">
      ih {window.innerHeight} · cl {root.clientHeight} · scr {Math.round(window.screen.height)} · dpr{' '}
      {window.devicePixelRatio}
      <br />
      vv {vv ? Math.round(vv.height) : '—'}@{vv ? Math.round(vv.offsetTop) : '—'} ×{vv?.scale ?? '—'}
      <br />
      dvh {p.dvh} · svh {p.svh} · lvh {p.lvh}
      <br />
      inset {p.insetTop}/{p.insetBottom} · {mode ?? 'unknown'} · vvh{' '}
      {root.style.getPropertyValue('--vvh') || 'unset'}
      <br />
      shell {rect('.app-shell')} · main {rect('main')} · nav {rect('nav')}
      <br />
      iw {window.innerWidth} · mq {window.matchMedia('(max-width: 700px)').matches ? 'y' : 'n'} ·
      shell {computed('.app-shell', 'height', 'max-height', 'position')}
      <br />
      main {computed('main', 'height', 'min-height', 'overflow-y')} · nav{' '}
      {computed('nav', 'position', 'height')}
    </p>
  )
}
