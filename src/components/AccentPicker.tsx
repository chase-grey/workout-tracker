import { useState, type CSSProperties } from 'react'
import { PressButton } from '../features/settings/PressButton'
import { ACCENTS, fromHsl, palette, parseHex, toHsl, type Hsl } from '../lib/theme'
import { setTheme, useTheme, useThemePref } from '../lib/themeStore'

const RAINBOW = 'conic-gradient(#f43f5e, #f59e0b, #22c55e, #14b8a6, #3b82f6, #a855f7, #f43f5e)'

const SWATCH = 'h-11 w-11 shrink-0 rounded-full ring-offset-2 ring-offset-bg'
const WORN = 'ring-2 ring-neutral-100'

/**
 * The accent: a row of swatches, each painted in its own accent's main shade so
 * the row shows what the app will look like rather than naming it, and a last
 * one for a colour of your own. Settings and the welcome screen both show this.
 *
 * The last swatch wears a rainbow rim so it reads as "any colour" before there
 * is one and as the one you can change after. Wearing it opens the mixer under
 * the row, and the whole app follows the sliders as they move.
 */
export function AccentPicker() {
  const { theme, scale } = useTheme()
  const pref = useThemePref()
  const own = theme.accent === 'custom'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-2 gap-y-3">
        {ACCENTS.map((a) => (
          <PressButton
            key={a}
            onPress={() => setTheme({ ...pref, accent: a })}
            label={a}
            pressed={theme.accent === a}
            className={`${SWATCH} ${theme.accent === a ? WORN : ''}`}
          >
            <span
              className="block h-full w-full rounded-full"
              style={{ background: palette({ ...theme, accent: a }).scale[600] }}
            />
          </PressButton>
        ))}
        <PressButton
          // Starts from the colour the app is wearing, so the first move of a
          // slider is a step away from something rather than from nowhere.
          onPress={() => setTheme({ ...pref, accent: 'custom', custom: pref.custom ?? scale[600] })}
          label="custom"
          pressed={own}
          className={`${SWATCH} p-[3px] ${own ? WORN : ''}`}
        >
          <span className="block h-full w-full rounded-full p-[3px]" style={{ background: RAINBOW }}>
            <span
              className="block h-full w-full rounded-full"
              style={{ background: pref.custom ?? 'transparent' }}
            />
          </span>
        </PressButton>
      </div>
      {own && pref.custom && (
        <Mixer hex={pref.custom} onChange={(custom) => setTheme({ ...pref, accent: 'custom', custom })} />
      )}
    </div>
  )
}

/**
 * Hue, saturation and lightness on three sliders, and the colour's hex beside
 * them for one that has to match something exactly. The browser's own colour
 * input isn't used: on the phone's Firefox it is a short list of fixed colours.
 *
 * The sliders keep their own positions rather than reading them back off the
 * hex, because a grey has no hue and a black no saturation: read back, the hue
 * slider would jump to red the moment the colour drained.
 */
function Mixer({ hex, onChange }: { hex: string; onChange: (hex: string) => void }) {
  const [hsl, setHsl] = useState<Hsl>(() => toHsl(hex))
  const [text, setText] = useState(hex)
  const [h, s, l] = hsl

  const mix = (next: Hsl) => {
    const mixed = fromHsl(next)
    setHsl(next)
    setText(mixed)
    onChange(mixed)
  }
  const type = (raw: string) => {
    setText(raw)
    const typed = parseHex(raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`)
    if (!typed) return
    setHsl(toHsl(typed))
    onChange(typed)
  }

  const css = (hue: number, sat: number, light: number) => `hsl(${hue} ${sat * 100}% ${light * 100}%)`
  const hues = [0, 60, 120, 180, 240, 300, 360].map((hue) => css(hue, s, l)).join(', ')
  const tracks = {
    hue: `linear-gradient(to right, ${hues})`,
    saturation: `linear-gradient(to right, ${css(h, 0, l)}, ${css(h, 1, l)})`,
    lightness: `linear-gradient(to right, #000000, ${css(h, s, 0.5)}, #ffffff)`,
  }
  const slider = (label: keyof typeof tracks, value: number, max: number, set: (v: number) => Hsl) => (
    <input
      type="range"
      aria-label={label}
      min={0}
      max={max}
      value={Math.round(value)}
      onChange={(e) => mix(set(Number(e.target.value)))}
      className="colour-slider"
      style={{ '--track': tracks[label] } as CSSProperties}
    />
  )

  return (
    <div className="flex flex-col rounded-xl bg-surface px-3 py-1">
      {slider('hue', h, 359, (v) => [v, s, l])}
      {slider('saturation', s * 100, 100, (v) => [h, v / 100, l])}
      {slider('lightness', l * 100, 100, (v) => [h, s, v / 100])}
      <input
        type="text"
        aria-label="hex"
        value={text}
        onChange={(e) => type(e.target.value)}
        onBlur={() => setText(hex)}
        maxLength={7}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className="mb-2 mt-1 min-h-[44px] rounded-lg bg-surface-2 px-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-accent"
      />
    </div>
  )
}
