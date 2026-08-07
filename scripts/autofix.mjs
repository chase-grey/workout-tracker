/**
 * `npm run autofix` — watch GitHub for issues labelled `auto-fix` and let the
 * locally-installed `claude` CLI fix them, committing straight to `main`.
 *
 * Why local, not a GitHub Action: the only Claude available here is signed in
 * with an Epic work account, whose credential must never be pushed into a public
 * personal repo's Action secrets. So the fixer runs on this machine, on the
 * Claude you already have. The tradeoff is that it only works while this machine
 * is awake — which it usually is when `dev:tunnel` is up powering the phone coach,
 * so `AUTOFIX=1 npm run dev:tunnel` lets the two ride together.
 *
 * Safety:
 *   - Work happens in a DEDICATED git worktree (.autofix/worktree), never your
 *     live checkout, so it can't commit your unrelated WIP or fight your edits.
 *   - Each issue is claimed with an `autofix-running` label before work starts,
 *     so a restart or a second tick never double-fixes one.
 *   - `main` auto-deploys, but the deploy workflow runs `npm test` first, so a
 *     change that breaks tests fails the deploy instead of shipping.
 *
 * Asking questions: a vague issue used to be dead — `claude -p` has no way to ask
 * anything and the run just ended. Now it can answer with a NEEDS-INPUT block,
 * which gets posted as an issue comment and parks the issue under `needs-input`.
 * The app shows that question in the coach chat, the answer comes back as another
 * comment, and the issue returns here labelled `auto-fix` again — this time run
 * with the whole comment thread in the prompt. The thread IS the memory: nothing
 * is resumed from a stored session, so a fixer restart loses none of it.
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { ASK_MARKER, parseAsk } from './parseAsk.mjs'

try {
  process.loadEnvFile(path.join(process.cwd(), '.env'))
} catch {
  /* no .env — fall back to the ambient environment */
}

const TOKEN = process.env.GITHUB_ISSUE_TOKEN || ''
const LABEL = process.env.AUTOFIX_LABEL || 'auto-fix'
const INTERVAL_MS = Number(process.env.AUTOFIX_INTERVAL_SEC || 60) * 1000
const PERMISSION = process.env.AUTOFIX_PERMISSION || 'acceptEdits' // 'acceptEdits' | 'skip'
const RUNNING_LABEL = 'autofix-running'
const FAILED_LABEL = 'autofix-failed'
// Parks an issue while the reporter answers. `auto-fix` comes off at the same
// time, so this poll leaves it alone until the app hands it back.
const ASK_LABEL = 'needs-input'
const WORKTREE = path.join(process.cwd(), '.autofix', 'worktree')
// The worktree gets its OWN branch: git refuses to check out `main` while your
// primary checkout has it, so borrowing the name left the worktree detached and
// turned the push into a no-op that still reported success.
const WORK_BRANCH = 'autofix-work'

if (!TOKEN) {
  console.error(
    'autofix: set GITHUB_ISSUE_TOKEN in .env (fine-grained PAT, Issues + Contents R/W).',
  )
  process.exit(1)
}

// owner/repo from the origin remote, so this stays correct if the repo moves.
function resolveRepo() {
  const out = spawnSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).stdout || ''
  const m = out.match(/github\.com[:/]([^/]+)\/(.+?)(?:\.git)?\s*$/i)
  if (!m) throw new Error('autofix: could not read a github origin remote')
  return `${m[1]}/${m[2]}`
}
const REPO = resolveRepo()

/* ------------------------------------------------------------- GitHub REST */

async function gh(method, apiPath, body) {
  const res = await fetch(`https://api.github.com${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`GitHub ${method} ${apiPath} failed: ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

const listOpenIssues = () =>
  gh('GET', `/repos/${REPO}/issues?state=open&labels=${encodeURIComponent(LABEL)}&per_page=20`)
const addLabels = (n, labels) => gh('POST', `/repos/${REPO}/issues/${n}/labels`, { labels })
const removeLabel = (n, label) =>
  gh('DELETE', `/repos/${REPO}/issues/${n}/labels/${encodeURIComponent(label)}`).catch(() => {})
const comment = (n, text) => gh('POST', `/repos/${REPO}/issues/${n}/comments`, { body: text })
const closeIssue = (n) => gh('PATCH', `/repos/${REPO}/issues/${n}`, { state: 'closed' })
const listComments = (n) =>
  gh('GET', `/repos/${REPO}/issues/${n}/comments?per_page=100`).catch(() => [])

/* --------------------------------------------------------------- worktree */

/** A clean checkout of the latest main, isolated from the user's working tree. */
function prepareWorktree() {
  mkdirSync(path.dirname(WORKTREE), { recursive: true })
  const git = (args, opts = {}) =>
    spawnSync('git', args, { encoding: 'utf8', stdio: 'pipe', ...opts })
  // Every step here has to be checked: a swallowed failure leaves the worktree
  // pointing somewhere stale and the fix gets built on the wrong base.
  const mustGit = (args, opts) => {
    const r = git(args, opts)
    if (r.status !== 0)
      throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || r.stdout || '').trim()}`)
    return r
  }
  mustGit(['fetch', 'origin', 'main'])
  if (!existsSync(WORKTREE)) {
    mustGit(['worktree', 'add', '--force', '-B', WORK_BRANCH, WORKTREE, 'origin/main'])
  }
  // Hard-reset the worktree to the current remote main so each fix starts fresh.
  const opts = { cwd: WORKTREE }
  mustGit(['checkout', '-B', WORK_BRANCH, 'origin/main'], opts)
  mustGit(['reset', '--hard', 'origin/main'], opts)
  mustGit(['clean', '-fd'], opts)
}

function worktreeGit(args) {
  return spawnSync('git', args, { cwd: WORKTREE, encoding: 'utf8' })
}

/** True if `claude` left committable changes in the worktree. */
function hasChanges() {
  return (worktreeGit(['status', '--porcelain']).stdout || '').trim().length > 0
}

/** True once origin/main carries `sha` — as its tip, or with later work on top. */
function landedOnMain(sha) {
  const head = ((worktreeGit(['ls-remote', 'origin', 'refs/heads/main']).stdout || '')
    .trim()
    .split(/\s+/)[0] || '')
  if (!head) return false
  if (head === sha) return true
  // Someone landed between the push and this check. Still a success, as long as
  // our commit is in the history they built on.
  worktreeGit(['fetch', 'origin', 'main'])
  return worktreeGit(['merge-base', '--is-ancestor', sha, head]).status === 0
}

/**
 * Land the worktree's HEAD on `main`, and return the sha that landed.
 *
 * A fix takes minutes to write and `main` moves the whole time — you push, or the
 * previous fix lands — so the first push of a run is routinely a non-fast-forward.
 * That's a stale base, not a bad fix, so rebase onto whatever arrived and try
 * again rather than throwing away work that's perfectly good. The sha changes on
 * every rebase, which is why it's read fresh each pass and returned rather than
 * captured by the caller.
 */
function pushToMain(attempts = 3) {
  for (let attempt = 1; ; attempt++) {
    const sha = (worktreeGit(['rev-parse', 'HEAD']).stdout || '').trim()
    // Push HEAD explicitly, not the branch NAME `main` — naming a local ref that
    // isn't the commit we just built is how a fix got reported as shipped while
    // `git push` sat there saying "Everything up-to-date".
    const push = worktreeGit(['push', 'origin', `${sha}:refs/heads/main`])
    // Trust the remote, not the exit code: confirm main really took our commit.
    if (push.status === 0 && landedOnMain(sha)) return sha
    const why = (push.stderr || '').trim() || `origin/main never took ${sha}`
    if (attempt >= attempts) throw new Error(`git push failed after ${attempts} tries: ${why}`)
    console.log(`autofix: push ${attempt} of ${attempts} bounced, rebasing onto the latest main.`)
    const fetched = worktreeGit(['fetch', 'origin', 'main'])
    if (fetched.status !== 0) throw new Error(`git fetch failed: ${fetched.stderr}`)
    const rebase = worktreeGit(['rebase', 'origin/main'])
    if (rebase.status !== 0) {
      // Leave the worktree usable: an interrupted rebase would wedge every run
      // after this one, and the next fix starts from a hard reset anyway.
      worktreeGit(['rebase', '--abort'])
      const detail = (rebase.stdout || rebase.stderr || '').trim().slice(0, 800)
      throw new Error(`the fix conflicts with newer work on main:\n${detail}`)
    }
  }
}

/* ----------------------------------------------------------------- claude */

function buildPrompt(issue, comments) {
  const lines = [
    `You are fixing GitHub issue #${issue.number} in this repository.`,
    '',
    `Title: ${issue.title}`,
    '',
    'Body:',
    issue.body || '(no description)',
  ]
  // The thread carries every earlier question and its answer, which is the only
  // memory across runs — each attempt is a fresh `claude`, not a resumed session.
  if (comments.length) {
    lines.push('', 'Comment thread so far (oldest first):')
    for (const c of comments) {
      lines.push('', `--- ${c.user?.login || 'someone'}:`, c.body || '')
    }
  }
  lines.push(
    '',
    'Instructions:',
    '- Investigate and implement a focused change for this issue only. It may be a bug',
    '  report or a feature request — both are in scope, so do not refuse one for not',
    '  being a bug.',
    '- Run `npm test` and make sure it passes before finishing.',
    '- Do NOT commit or push — the surrounding script handles git.',
    '- If you genuinely cannot act without more from the reporter, make NO changes and',
    `  reply with the single word ${ASK_MARKER} on its own first line, then your`,
    "  questions. They are shown on the reporter's phone and answered there, so ask",
    '  the fewest that unblock you, in plain language, with no code or file paths.',
    '  Prefer a reasonable assumption over a question whenever you can state it.',
    '- Anything already answered in the thread above is settled — do not ask it again.',
  )
  return lines.join('\n')
}

/**
 * Run the local `claude` on the prompt inside the worktree. Resolves on exit.
 *
 * stdout is piped and echoed rather than inherited: the final message is how
 * claude asks for more information, so it has to be readable here and not only
 * on the console.
 */
function runClaude(issue, comments) {
  return new Promise((resolve) => {
    const args = ['-p']
    if (PERMISSION === 'skip') args.push('--dangerously-skip-permissions')
    else args.push('--permission-mode', 'acceptEdits')
    // shell:true resolves the claude.cmd shim on Windows; args are all static and
    // the (untrusted) issue text goes in over stdin, so nothing is shell-injected.
    const child = spawn('claude', args, { cwd: WORKTREE, stdio: ['pipe', 'pipe', 'inherit'], shell: true })
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      out += chunk
      process.stdout.write(chunk)
    })
    // `close`, not `exit`: exit fires the moment the process ends, with the tail
    // of stdout still unread — which is exactly where the question would be.
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    child.on('error', (err) => done({ ok: false, out, detail: String(err) }))
    child.on('close', (code) => done({ ok: code === 0, out, detail: `claude exited ${code}` }))
    child.stdin.write(buildPrompt(issue, comments))
    child.stdin.end()
  })
}

/* ------------------------------------------------------------- processing */

const seen = new Set() // numbers handled this run, so a slow tick doesn't re-grab

async function processIssue(issue) {
  const n = issue.number
  console.log(`\nautofix: working #${n} — ${issue.title}`)
  await addLabels(n, [RUNNING_LABEL])
  try {
    prepareWorktree()
    const comments = await listComments(n)
    const res = await runClaude(issue, comments)
    if (!res.ok) throw new Error(res.detail)
    if (!hasChanges()) {
      // A question is only a question if nothing was changed — a run that both
      // edited files and mused about what it was unsure of is a fix, and the
      // musing belongs in the commit, not on the reporter's phone.
      const ask = parseAsk(res.out)
      if (ask) {
        await comment(n, `**Auto-fix needs a bit more to go on:**\n\n${ask}`)
        await removeLabel(n, RUNNING_LABEL)
        // Drop `auto-fix` as well: with it on, the next tick would pick the issue
        // straight back up and ask the same question into the void.
        await removeLabel(n, LABEL)
        await addLabels(n, [ASK_LABEL])
        // Forget it, so the answer can bring it back around this same run.
        seen.delete(n)
        console.log(`autofix: #${n} is waiting on an answer.`)
        return
      }
      await comment(n, `Auto-fix ran but made no changes (${res.detail}). Leaving open for a human.`)
      await removeLabel(n, RUNNING_LABEL)
      await addLabels(n, [FAILED_LABEL])
      return
    }
    worktreeGit(['add', '-A'])
    const msg = `Auto-fix issue #${n}: ${issue.title}\n\nFixes #${n}`
    const commit = worktreeGit(['commit', '-m', msg])
    if (commit.status !== 0) throw new Error(`git commit failed: ${commit.stderr}`)
    const sha = pushToMain()
    await comment(n, `Fixed on \`main\` in ${sha.slice(0, 8)}. It will deploy once CI passes.`)
    await removeLabel(n, RUNNING_LABEL)
    await closeIssue(n)
    console.log(`autofix: #${n} fixed and pushed (${sha.slice(0, 8)}).`)
  } catch (err) {
    console.error(`autofix: #${n} failed — ${err}`)
    await comment(n, `Auto-fix failed:\n\n\`\`\`\n${String(err).slice(0, 1500)}\n\`\`\``).catch(() => {})
    await removeLabel(n, RUNNING_LABEL)
    await addLabels(n, [FAILED_LABEL]).catch(() => {})
  }
}

async function tick() {
  let issues
  try {
    issues = await listOpenIssues()
  } catch (err) {
    console.error(`autofix: poll failed — ${err}`)
    return
  }
  for (const issue of issues) {
    if (issue.pull_request) continue // the issues endpoint also returns PRs
    const labels = (issue.labels || []).map((l) => (typeof l === 'string' ? l : l.name))
    if (labels.includes(RUNNING_LABEL) || labels.includes(FAILED_LABEL)) continue
    // Asking removes `auto-fix`, so this shouldn't come back — unless both labels
    // were put on by hand, in which case the answer still hasn't arrived.
    if (labels.includes(ASK_LABEL)) continue
    if (seen.has(issue.number)) continue
    seen.add(issue.number)
    await processIssue(issue) // one at a time: they share one worktree + main
  }
}

console.log(`autofix: watching ${REPO} for "${LABEL}" issues every ${INTERVAL_MS / 1000}s.`)
await tick()
setInterval(() => void tick(), INTERVAL_MS)
