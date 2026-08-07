import { useEffect, useState } from 'react'
import { useData } from '../../store/DataContext'
import { fetchChatEndpoint, forgetChatEndpoint } from '../../services/chatEndpoint'
import { issueProgress, type IssueProgress, type TrackedIssue } from '../../services/issues'
import { PhoneLink } from './PhoneLink'
import { IS_DESKTOP } from '../../lib/device'
import { APP_COMMIT, APP_BUILD_TIME, checkForUpdate } from '../../lib/version'
import { DEFAULT_FLEX_ROUTINE } from '../../config/flexPlan'

const MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1']

// `working` reads amber rather than green: it's a run in flight, not a result.
// `asks` is the only one that wants you to do something, so it's the loudest.
const ISSUE_BADGE: Record<IssueProgress, string> = {
  open: 'bg-accent/20 text-accent',
  working: 'bg-amber-400/20 text-amber-400',
  asks: 'bg-accent text-black',
  stalled: 'bg-red-400/20 text-red-400',
  closed: 'bg-neutral-700 text-neutral-300',
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
  const { settings, updateSettings, sync, lastSync, pendingWrites, updateFlexPlan } = useData()
  // Two taps to restore the routine: it throws away every coach edit ever made
  // to it, which is the point after a bad one, but not something to do by brush.
  const [confirmRestore, setConfirmRestore] = useState(false)
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

  // Once the token reaches a coach there's nothing left to type, so the field only
  // comes back if the coach goes missing and the token needs re-entering.
  const showTokenField = coach !== 'live'

  const coachStatus =
    coach === 'untried'
      ? 'no token — chat falls back to the OpenAI key below'
      : coach === 'checking'
        ? 'looking for your computer…'
        : coach === 'live'
          ? 'coach found ✓'
          : 'no computer is running dev:tunnel right now'

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
      </section>

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
            issues.map((issue) => {
              const progress = issueProgress(issue)
              const badge = (
                <>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${ISSUE_BADGE[progress]}`}
                  >
                    {progress}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>
                  <span className="shrink-0 font-mono text-xs text-neutral-500">
                    #{issue.number}
                  </span>
                </>
              )
              const row = 'flex min-h-[44px] items-center gap-3 rounded-xl bg-surface px-3'
              // An issue that's asking goes to the coach to be answered instead of
              // out to github.com — answering is the whole reason it's on screen,
              // and the phone is where you'll be when you see it.
              return progress === 'asks' ? (
                <button
                  key={issue.number}
                  onClick={() => onAnswer(issue.number)}
                  className={`${row} w-full text-left active:bg-surface-2`}
                >
                  {badge}
                </button>
              ) : (
                <a
                  key={issue.number}
                  href={issue.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`${row} active:bg-surface-2`}
                >
                  {badge}
                </a>
              )
            })
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
      </section>

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">stretch routine</label>
        <button
          onClick={() => {
            if (!confirmRestore) {
              setConfirmRestore(true)
              return
            }
            updateFlexPlan(DEFAULT_FLEX_ROUTINE)
            setConfirmRestore(false)
          }}
          onBlur={() => setConfirmRestore(false)}
          className="min-h-[44px] rounded-xl bg-surface font-medium active:bg-surface-2"
        >
          {confirmRestore ? 'tap again to restore' : 'restore default routine'}
        </button>
      </section>

      <PhoneLink />

      <section className="flex flex-col gap-2">
        <label className="text-sm font-medium text-neutral-300">coach token (for chat)</label>
        {showTokenField && (
          <>
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
          </>
        )}
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
