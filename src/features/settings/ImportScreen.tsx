import { useMemo, useState } from 'react'
import { useData } from '../../store/DataContext'
import { ALL_EXERCISES } from '../../config/plan'
import {
  buildBodyWeightEntries,
  buildWorkoutRows,
  parseImport,
  type ImportResult,
} from '../../lib/parseImport'

const SKIP = '__skip__'
const NEW = '__new__'

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

export function ImportScreen({ onClose }: { onClose: () => void }) {
  const { importData } = useData()
  const [text, setText] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [decisions, setDecisions] = useState<Record<string, string>>({})
  const [done, setDone] = useState<string | null>(null)

  const parse = () => {
    const r = parseImport(text)
    setResult(r)
    setDecisions(
      Object.fromEntries(r.exercises.map((e) => [e.rawName, e.match.isNew ? NEW : (e.match.key ?? NEW)])),
    )
    setDone(null)
  }

  const totals = useMemo(() => {
    if (!result) return { sets: 0, entries: 0 }
    let sets = 0
    let entries = 0
    for (const e of result.exercises) {
      if (decisions[e.rawName] === SKIP) continue
      entries += e.entries.length
      sets += e.entries.reduce((n, en) => n + en.sets.length, 0)
    }
    return { sets, entries }
  }, [result, decisions])

  const confirm = async () => {
    if (!result) return
    const keyByRawName: Record<string, string> = {}
    for (const e of result.exercises) {
      const d = decisions[e.rawName]
      if (d === SKIP) continue
      keyByRawName[e.rawName] = d === NEW ? slugify(e.match.name || e.rawName) : d
    }
    const rows = buildWorkoutRows(result.exercises, keyByRawName)
    const bws = buildBodyWeightEntries(result.bodyWeights)
    await importData(rows, bws)
    setDone(`Imported ${rows.length} sets and ${bws.length} weigh-ins.`)
    setResult(null)
    setText('')
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-lg font-bold">Import history</h2>
        <button onClick={onClose} className="min-h-[44px] px-2 text-neutral-400">
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {done && (
          <div className="mb-4 rounded-xl bg-accent-2/20 p-3 text-sm text-accent-2">{done}</div>
        )}

        {!result ? (
          <>
            <p className="mb-2 text-sm text-neutral-400">
              Paste your exercise and body-weight tables. Config/superset tables and empty tables are
              ignored automatically.
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={12}
              placeholder={'leg raises\n| date | reps |\n| --- | --- |\n| 4/27 | 13x4 |'}
              className="w-full rounded-xl bg-surface p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              onClick={parse}
              disabled={!text.trim()}
              className="mt-3 min-h-[48px] w-full rounded-2xl bg-accent font-bold text-black disabled:opacity-30"
            >
              Parse
            </button>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-neutral-400">
              {result.exercises.length} exercises · {totals.entries} sessions · {totals.sets} sets ·{' '}
              {result.bodyWeights.length} weigh-ins
            </p>

            <div className="flex flex-col gap-2">
              {result.exercises.map((e) => {
                const warnCount = e.entries.reduce((n, en) => n + en.warnings.length, 0)
                return (
                  <div key={e.rawName} className="rounded-xl bg-surface p-3">
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <span className="font-medium">
                        {e.rawName}
                        {e.match.isNew && (
                          <span className="ml-2 text-xs text-neutral-500">(no match)</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-neutral-500">
                        {e.entries.length} sessions
                      </span>
                    </div>
                    <select
                      value={decisions[e.rawName]}
                      onChange={(ev) => setDecisions((d) => ({ ...d, [e.rawName]: ev.target.value }))}
                      className="min-h-[44px] w-full rounded-lg bg-surface-2 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value={NEW}>➕ Import as new: “{e.match.name || e.rawName}”</option>
                      {ALL_EXERCISES.map((x) => (
                        <option key={x.key} value={x.key}>
                          {x.name}
                        </option>
                      ))}
                      <option value={SKIP}>⨯ Skip this exercise</option>
                    </select>
                    {warnCount > 0 && (
                      <p className="mt-1 text-xs text-accent">
                        ⚠️ {warnCount} ambiguous weight row{warnCount === 1 ? '' : 's'} — verify after import
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setResult(null)}
                className="min-h-[48px] flex-1 rounded-2xl bg-surface font-medium"
              >
                Back
              </button>
              <button
                onClick={confirm}
                className="min-h-[48px] flex-[2] rounded-2xl bg-accent font-bold text-black"
              >
                Confirm import
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
