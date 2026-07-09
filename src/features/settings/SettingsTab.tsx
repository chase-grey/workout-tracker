import { useState } from 'react'
import { useData } from '../../store/DataContext'
import { download, workoutsToCsv } from '../../lib/csv'
import { ImportScreen } from './ImportScreen'
import { PlateCalculator } from '../tools/PlateCalculator'

const SYNC_LABEL: Record<string, string> = {
  idle: 'Synced',
  syncing: 'Syncing…',
  offline: 'Not connected',
  error: 'Sync error',
}

export function SettingsTab() {
  const { settings, updateSettings, refresh, sync, pendingWrites, workouts } = useData()
  const [apiUrl, setApiUrl] = useState(settings.apiUrl)
  const [saved, setSaved] = useState(false)
  const [importing, setImporting] = useState(false)
  const [openAiKey, setOpenAiKey] = useState(settings.openAiKey)
  const [keySaved, setKeySaved] = useState(false)

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

  return (
    <div className="flex flex-col gap-6 pb-24">
      <h2 className="text-xl font-bold">Settings</h2>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">Google Apps Script URL</label>
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
          {saved ? 'Saved ✓' : 'Save & sync'}
        </button>
        <p className="text-xs text-neutral-500">
          Status: {SYNC_LABEL[sync] ?? sync}
          {pendingWrites > 0 && ` · ${pendingWrites} write${pendingWrites === 1 ? '' : 's'} queued`}
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">Data</label>
        <button
          onClick={() => setImporting(true)}
          className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
        >
          Import historical data
        </button>
        <button
          onClick={() => download(`workouts-${new Date().toISOString().slice(0, 10)}.csv`, workoutsToCsv(workouts))}
          className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
        >
          Export workouts as CSV
        </button>
      </section>

      {importing && <ImportScreen onClose={() => setImporting(false)} />}

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">OpenAI API key (for Chat)</label>
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
          {keySaved ? 'Saved ✓' : 'Save key'}
        </button>
        <p className="text-xs text-neutral-500">
          Stored on this device only; sent directly to OpenAI when you chat.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">Plate calculator</label>
        <PlateCalculator />
      </section>

      <section className="flex flex-col gap-1">
        <label className="text-sm font-medium text-neutral-300">About</label>
        <p className="text-xs text-neutral-500">
          Workout Tracker · data stored in your Google Sheet via Apps Script.
        </p>
      </section>
    </div>
  )
}
