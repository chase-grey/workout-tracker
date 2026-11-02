import { useState } from 'react'
import { MdKeyboardArrowDown } from 'react-icons/md'
import { useData } from '../../store/DataContext'
import { SaveStatus } from '../../components/SaveStatus'
import { BackendBanner } from '../../components/BackendBanner'
import {
  issueProgress,
  partitionIssues,
  type IssueProgress,
  type TrackedIssue,
} from '../../services/issues'
import { PhoneLink } from './PhoneLink'
import { PoseCheck } from './PoseCheck'
import { PlanEditor } from './PlanEditor'
import { APP_COMMIT, APP_BUILD_TIME, checkForUpdate } from '../../lib/version'
import { stashResumeTab } from '../../lib/resumeTab'
import { FLEX_ROUTINES, FLEX_ROUTINE_KEYS, type FlexRoutineKey } from '../../config/flexRoutines'
import { ACCENTS, MODES, palette } from '../../lib/theme'
import { setTheme, useTheme } from '../../lib/themeStore'
import { PROVIDERS, providerOf, trimBaseUrl } from '../../lib/aiProvider'

const FIELD =
  'min-h-[44px] rounded-xl bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent'

// The accent shades run brightest-first down the same order the list is sorted in:
// `working` is a run happening right now, `open` is waiting its turn, and a fix
// that landed sits in the dark accent with the rest of history. `stalled` drops out of
// the ladder into grey — nothing is moving on it. `asks` and `review` keep the solid
// fill: they're the two that want something from you — an answer, or a merge.
const ISSUE_BADGE: Record<IssueProgress, string> = {
  asks: 'bg-accent text-on-accent',
  review: 'bg-accent-bright text-on-accent',
  working: 'bg-accent-bright/20 text-accent-bright',
  open: 'bg-accent-2/20 text-accent-2',
  stalled: 'bg-neutral-700 text-neutral-300',
  completed: 'bg-accent/20 text-accent',
  closed: 'bg-accent/20 text-accent',
}

/**
 * Accent swatches, then the ground. Each swatch is painted in its own accent's
 * CTA shade, so the row shows what the app will look like rather than naming it.
 */
function ThemePicker() {
  const { theme } = useTheme()
  return (
    <section className="flex flex-col gap-2">
      <label className="text-sm font-medium text-neutral-300">theme</label>
      <div className="flex gap-3">
        {ACCENTS.map((a) => (
          <button
            key={a}
            onClick={() => setTheme({ ...theme, accent: a })}
            aria-label={a}
            aria-pressed={theme.accent === a}
            className={`h-11 w-11 rounded-full ring-offset-2 ring-offset-bg ${
              theme.accent === a ? 'ring-2 ring-neutral-100' : ''
            }`}
            style={{ background: palette({ ...theme, accent: a }).scale[600] }}
          />
        ))}
      </div>
      <div className="flex gap-1 rounded-xl bg-surface p-1">
        {MODES.map((m) => (
          <button
            key={m}
            onClick={() => setTheme({ ...theme, mode: m })}
            className={`min-h-[36px] flex-1 rounded-lg px-2 text-sm font-medium ${
              theme.mode === m ? 'bg-accent text-on-accent' : 'text-neutral-400'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </section>
  )
}

const ISSUE_ROW = 'flex min-h-[44px] items-center gap-3 rounded-xl bg-surface px-3'

/**
 * One issue in the Settings list. An issue that's asking goes to the coach to be
 * answered instead of out to github.com — answering is the whole reason it's on
 * screen, and the phone is where you'll be when you see it.
 */
function IssueRow({ issue, onAnswer }: { issue: TrackedIssue; onAnswer: (n: number) => void }) {
  const progress = issueProgress(issue)
  const badge = (
    <>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${ISSUE_BADGE[progress]}`}
      >
        {progress}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>
      <span className="shrink-0 font-mono text-xs text-neutral-500">#{issue.number}</span>
    </>
  )
  return progress === 'asks' ? (
    <button
      onClick={() => onAnswer(issue.number)}
      className={`${ISSUE_ROW} w-full text-left active:bg-surface-2`}
    >
      {badge}
    </button>
  ) : (
    <a
      href={issue.url}
      target="_blank"
      rel="noreferrer"
      className={`${ISSUE_ROW} active:bg-surface-2`}
    >
      {badge}
    </a>
  )
}

const SYNC_LABEL: Record<string, string> = {
  idle: 'synced',
  syncing: 'syncing…',
  offline: 'not connected',
  error: 'sync error',
}

export function SettingsTab({
  issues,
  issuesFailed,
  onAnswer,
}: {
  /** The shared issue list from useTrackedIssues; null before a first read. */
  issues: TrackedIssue[] | null
  issuesFailed: boolean
  /** Hand an issue the fixer is asking about to the coach tab to be answered. */
  onAnswer: (number: number) => void
}) {
  const { settings, updateSettings, sync, lastSync, pendingWrites, updateFlexPlan, refresh } = useData()
  // Two taps to restore a routine: it throws away every coach edit ever made to
  // it, which is the point after a bad one, but not something to do by brush.
  // Held per routine, so arming one doesn't arm the other.
  const [confirmRestore, setConfirmRestore] = useState<FlexRoutineKey | null>(null)
  // The coach's key, base url and model are drafts until `save`: every
  // settings write goes to the backend, and a model name typed letter by
  // letter would send one per letter.
  const [openAiKey, setOpenAiKey] = useState(settings.openAiKey)
  const [baseUrlDraft, setBaseUrlDraft] = useState(settings.aiBaseUrl ?? '')
  const [modelDraft, setModelDraft] = useState(settings.openAiModel ?? '')
  const [keySaved, setKeySaved] = useState(false)
  const provider = providerOf(settings.aiProvider)
  const [chatTokenDraft, setChatTokenDraft] = useState(settings.chatToken)
  const [chatTokenSaved, setChatTokenSaved] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  // Closed issues fold away by default — they're history, and the live ones are
  // what you came here for. Opening them lasts only as long as the visit.
  const [showClosed, setShowClosed] = useState(false)

  const { active, closed } = partitionIssues(issues ?? [])

  const saveKey = () => {
    updateSettings({
      ...settings,
      openAiKey: openAiKey.trim(),
      aiBaseUrl: trimBaseUrl(baseUrlDraft),
      openAiModel: modelDraft.trim() || provider.defaultModel,
    })
    setKeySaved(true)
    setTimeout(() => setKeySaved(false), 1500)
  }

  // A new service means a new model name, filled in to be saved with the key
  // you're about to replace in the field beneath.
  const pickProvider = (id: string) => {
    const next = providerOf(id)
    setModelDraft(next.defaultModel)
    updateSettings({ ...settings, aiProvider: next.id, openAiModel: next.defaultModel })
  }

  const saveChatToken = () => {
    updateSettings({ ...settings, chatToken: chatTokenDraft.trim() })
    setChatTokenSaved(true)
    setTimeout(() => setChatTokenSaved(false), 1500)
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <h2 className="text-xl font-bold">settings</h2>
      <BackendBanner />
      <SaveStatus />

      <ThemePicker />

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">build</label>
        <p className="text-xs text-neutral-500">
          version <span className="font-mono text-neutral-300">{APP_COMMIT}</span> · built{' '}
          {new Date(APP_BUILD_TIME).toLocaleString()}
        </p>
        {/* Waiting for the new worker to take over takes a moment, and an
            unchanged button invites the second tap this is meant to remove. */}
        <button
          onClick={() => {
            setCheckingUpdate(true)
            // Come back here rather than to Today — you tapped this to see the
            // build stamp change.
            stashResumeTab('settings')
            void checkForUpdate()
          }}
          disabled={checkingUpdate}
          className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2 disabled:text-neutral-500"
        >
          {checkingUpdate ? 'checking…' : 'check for updates & reload'}
        </button>
      </section>

      <PoseCheck />

      {settings.chatToken.trim() && (
        <section className="flex flex-col gap-2">
          <label className="text-sm font-medium text-neutral-300">reported issues</label>
          {/* A failed refresh still shows the cached list, but it says so: an issue
              closed since the last read would otherwise sit here reading "open". */}
          {issuesFailed && issues !== null && (
            <p className="text-xs text-neutral-500">couldn’t reach the issue tracker — showing the last read</p>
          )}
          {issues === null ? (
            issuesFailed ? (
              <p className="text-xs text-neutral-500">couldn’t reach the issue tracker</p>
            ) : (
              <p className="text-xs text-neutral-500">loading…</p>
            )
          ) : issues.length === 0 ? (
            <p className="text-xs text-neutral-500">no issues filed yet</p>
          ) : (
            <>
              {active.map((issue) => (
                <IssueRow key={issue.number} issue={issue} onAnswer={onAnswer} />
              ))}
              {active.length === 0 && <p className="text-xs text-neutral-500">nothing open</p>}
              {closed.length > 0 && (
                <>
                  <button
                    onClick={() => setShowClosed(!showClosed)}
                    aria-expanded={showClosed}
                    className="flex min-h-[44px] items-center gap-1 self-start text-sm text-neutral-400 active:text-neutral-200"
                  >
                    closed ({closed.length})
                    <MdKeyboardArrowDown
                      className={`text-lg ${showClosed ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </button>
                  {showClosed &&
                    closed.map((issue) => (
                      <IssueRow key={issue.number} issue={issue} onAnswer={onAnswer} />
                    ))}
                </>
              )}
            </>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">sync</label>
        <p className="text-xs text-neutral-500">
          status: {SYNC_LABEL[sync] ?? sync}
          {pendingWrites > 0 && ` · ${pendingWrites} write${pendingWrites === 1 ? '' : 's'} queued`}
        </p>
        <p className="text-xs text-neutral-500">
          last synced: {lastSync ? new Date(lastSync).toLocaleString() : 'never'}
        </p>
        <button
          onClick={() => void refresh()}
          disabled={sync === 'syncing'}
          className="min-h-[44px] rounded-xl bg-surface text-sm font-semibold active:bg-surface-2 disabled:text-neutral-600"
        >
          {sync === 'syncing' ? 'syncing…' : 'sync now'}
        </button>
      </section>

      <PlanEditor />

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">stretch routines</label>
        {FLEX_ROUTINE_KEYS.map((r) => (
          <button
            key={r}
            onClick={() => {
              if (confirmRestore !== r) {
                setConfirmRestore(r)
                return
              }
              updateFlexPlan(r, FLEX_ROUTINES[r].blocks)
              setConfirmRestore(null)
            }}
            onBlur={() => setConfirmRestore(null)}
            className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
          >
            {confirmRestore === r
              ? 'tap again to restore'
              : `restore default ${FLEX_ROUTINES[r].label} routine`}
          </button>
        ))}
      </section>

      <PhoneLink />

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">issue token</label>
        <input
          type="password"
          value={chatTokenDraft}
          onChange={(e) => setChatTokenDraft(e.target.value)}
          placeholder="the CHAT_SHARED_SECRET script property"
          autoComplete="off"
          className="min-h-[44px] rounded-xl bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
        />
        <button
          onClick={saveChatToken}
          className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
        >
          {chatTokenSaved ? 'saved ✓' : 'save token'}
        </button>
      </section>

      {/* Flipping the switch on is what brings the key field up underneath,
          and the tab appears in the nav at the same moment. */}
      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">coach</label>
        <div className="flex gap-1 rounded-xl bg-surface p-1">
          {([false, true] as const).map((on) => (
            <button
              key={String(on)}
              onClick={() => updateSettings({ ...settings, coachEnabled: on })}
              aria-pressed={(settings.coachEnabled ?? false) === on}
              className={`min-h-[36px] flex-1 rounded-lg px-2 text-sm font-medium ${
                (settings.coachEnabled ?? false) === on
                  ? 'bg-accent text-on-accent'
                  : 'text-neutral-400'
              }`}
            >
              {on ? 'on' : 'off'}
            </button>
          ))}
        </div>
      </section>

      {settings.coachEnabled && (
        <section className="flex flex-col gap-2">
          <label className="text-sm font-medium text-neutral-300">ai provider</label>
          <select value={provider.id} onChange={(e) => pickProvider(e.target.value)} className={FIELD}>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {provider.baseUrl === null && (
            <input
              type="url"
              value={baseUrlDraft}
              onChange={(e) => setBaseUrlDraft(e.target.value)}
              placeholder="https://host/v1"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              className={FIELD}
            />
          )}
          <input
            type="password"
            value={openAiKey}
            onChange={(e) => setOpenAiKey(e.target.value)}
            placeholder={provider.keyHint}
            autoComplete="off"
            className={FIELD}
          />
          {/* Free text with the provider's models as suggestions: a service
              adds models faster than a list here would follow, and OpenRouter
              alone has hundreds. */}
          <input
            list="coach-models"
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            placeholder={provider.defaultModel || 'model'}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className={FIELD}
          />
          <datalist id="coach-models">
            {provider.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <button
            onClick={saveKey}
            className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
          >
            {keySaved ? 'saved ✓' : 'save'}
          </button>
        </section>
      )}
    </div>
  )
}
