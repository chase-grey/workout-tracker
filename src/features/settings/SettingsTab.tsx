import { useEffect, useState } from 'react'
import { useData } from '../../store/DataContext'
import { fetchChatEndpoint, forgetChatEndpoint } from '../../services/chatEndpoint'
import { download, workoutsToCsv } from '../../lib/csv'
import { ImportScreen } from './ImportScreen'
import { PlanEditor } from './PlanEditor'
import { FlexRoutineEditor } from './FlexRoutineEditor'
import { PhoneLink } from './PhoneLink'
import { ViewportDebug } from './ViewportDebug'
import { IS_DESKTOP } from '../../lib/device'
import { APP_COMMIT, APP_BUILD_TIME, checkForUpdate } from '../../lib/version'
import { DAY_TYPES, DEFAULT_PLAN } from '../../config/plan'
import type { DayType } from '../../types'

const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1']

const SYNC_LABEL: Record<string, string> = {
  idle: 'synced',
  syncing: 'syncing…',
  offline: 'not connected',
  error: 'sync error',
}

export function SettingsTab() {
  const { settings, updateSettings, refresh, sync, lastSync, pendingWrites, workouts, plan, updatePlan } = useData()
  const [apiUrl, setApiUrl] = useState(settings.apiUrl)
  const [saved, setSaved] = useState(false)
  const [importing, setImporting] = useState(false)
  const [editingPlan, setEditingPlan] = useState<DayType | null>(null)
  const [editingFlex, setEditingFlex] = useState(false)
  const [openAiKey, setOpenAiKey] = useState(settings.openAiKey)
  const [keySaved, setKeySaved] = useState(false)
  const [chatTokenDraft, setChatTokenDraft] = useState(settings.chatToken)
  const [chatTokenSaved, setChatTokenSaved] = useState(false)
  // Whether a laptop has published a coach address the token can actually reach.
  const [coach, setCoach] = useState<'checking' | 'live' | 'none' | 'untried'>('untried')

  useEffect(() => {
    if (!settings.chatToken.trim()) return setCoach('untried')
    setCoach('checking')
    let alive = true
    void fetchChatEndpoint().then((e) => alive && setCoach(e ? 'live' : 'none'))
    return () => {
      alive = false
    }
  }, [settings.chatToken])

  const coachStatus =
    coach === 'untried'
      ? 'no token — chat falls back to the OpenAI key below'
      : coach === 'checking'
        ? 'looking for your computer…'
        : coach === 'live'
          ? 'coach found ✓'
          : 'no computer is running dev:tunnel right now'

  const save = () => {
    updateSettings({ ...settings, apiUrl: apiUrl.trim() })
    setSaved(true)
    void refresh()
    setTimeout(() => setSaved(false), 1500)
  }

  const saveKey = () => {
    updateSettings({ ...settings, openAiKey: openAiKey.trim() })
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 1500)
  }

  const saveChatToken = () => {
    // The old token is what the cached coach address was looked up with.
    forgetChatEndpoint()
    updateSettings({ ...settings, chatToken: chatTokenDraft.trim() })
    setChatTokenSaved(true)
    setTimeout(() => setChatTokenSaved(false), 1500)
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <h2 className="text-xl font-bold">settings</h2>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">build</label>
        <p className="text-xs text-neutral-500">
          version <span className="font-mono text-neutral-300">{APP_COMMIT}</span> · built{' '}
          {new Date(APP_BUILD_TIME).toLocaleString()}
        </p>
        <button
          onClick={() => void checkForUpdate()}
          className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
        >
          check for updates &amp; reload
        </button>
        {/* TEMPORARY — remove with ViewportDebug once the installed app stops
            cropping the bottom of the screen. */}
        <ViewportDebug />
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">google apps script url</label>
        <input
          value={apiUrl}
          onChange={(e) => setApiUrl(e.target.value)}
          placeholder="https://script.google.com/macros/s/…/exec"
          className="min-h-[44px] rounded-xl bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          onClick={save}
          className="min-h-[44px] rounded-xl bg-accent font-semibold text-black active:opacity-80"
        >
          {saved ? 'saved ✓' : 'save & sync'}
        </button>
        <p className="text-xs text-neutral-500">
          status: {SYNC_LABEL[sync] ?? sync}
          {pendingWrites > 0 && ` · ${pendingWrites} write${pendingWrites === 1 ? '' : 's'} queued`}
        </p>
        <p className="text-xs text-neutral-500">
          last synced: {lastSync ? new Date(lastSync).toLocaleString() : 'never'}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">plans</label>
        {DAY_TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setEditingPlan(t)}
            className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
          >
            edit {plan[t].label}
          </button>
        ))}
        <button
          onClick={() => setEditingFlex(true)}
          className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
        >
          edit stretch
        </button>
        <button
          onClick={() => {
            if (confirm('replace your plan with the latest defaults? any customizations you made will be overwritten.'))
              updatePlan(structuredClone(DEFAULT_PLAN))
          }}
          className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
        >
          reset plan to latest defaults
        </button>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">data</label>
        <button
          onClick={() => setImporting(true)}
          className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
        >
          import historical data
        </button>
        <button
          onClick={() => download(`workouts-${new Date().toISOString().slice(0, 10)}.csv`, workoutsToCsv(workouts))}
          className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
        >
          export workouts as CSV
        </button>
      </section>

      {importing && <ImportScreen onClose={() => setImporting(false)} />}
      {editingPlan && <PlanEditor day={editingPlan} onClose={() => setEditingPlan(null)} />}
      {editingFlex && <FlexRoutineEditor onClose={() => setEditingFlex(false)} />}

      <PhoneLink />

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">coach token (for chat)</label>
        <input
          type="password"
          value={chatTokenDraft}
          onChange={(e) => setChatTokenDraft(e.target.value)}
          placeholder="the CHAT_SHARED_SECRET from your computer"
          autoComplete="off"
          className="min-h-[44px] rounded-xl bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          onClick={saveChatToken}
          className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
        >
          {chatTokenSaved ? 'saved ✓' : 'save token'}
        </button>
        <p className="text-xs text-neutral-500">{coachStatus}</p>
      </section>

      {IS_DESKTOP && (
        <section className="flex flex-col gap-2">
          <label className="text-sm font-medium text-neutral-300">openai api key (for chat)</label>
          <input
            type="password"
            value={openAiKey}
            onChange={(e) => setOpenAiKey(e.target.value)}
            placeholder="sk-…"
            autoComplete="off"
            className="min-h-[44px] rounded-xl bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={saveKey}
            className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
          >
            {keySaved ? 'saved ✓' : 'save key'}
          </button>
          <select
            value={settings.openAiModel ?? 'gpt-4o-mini'}
            onChange={(e) => updateSettings({ ...settings, openAiModel: e.target.value })}
            className="min-h-[44px] rounded-xl bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </section>
      )}
    </div>
  )
}
