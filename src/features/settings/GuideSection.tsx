import { useData } from '../../store/DataContext'
import { restartTour } from '../../lib/tour'

/** Guide mode's switch, and the way back to the start of its tour. */
export function GuideSection() {
  const { settings, updateSettings } = useData()
  const on = settings.guideMode === true
  return (
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-300">show me around</label>
      <div className="flex gap-1 rounded-xl bg-surface p-1">
        {([false, true] as const).map((v) => (
          <button
            key={String(v)}
            onClick={() => updateSettings({ ...settings, guideMode: v })}
            aria-pressed={on === v}
            className={`min-h-[36px] flex-1 rounded-lg px-2 text-sm font-medium ${
              on === v ? 'bg-accent text-on-accent' : 'text-neutral-400'
            }`}
          >
            {v ? 'on' : 'off'}
          </button>
        ))}
      </div>
      <button
        onClick={() => {
          const t = restartTour()
          void updateSettings({ ...settings, guideMode: true, tourSeen: [...t.seen], tourDone: t.done })
        }}
        className="min-h-[44px] rounded-xl bg-surface text-sm font-semibold active:bg-surface-2"
      >
        restart the tour
      </button>
    </section>
  )
}
