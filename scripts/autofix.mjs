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
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

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

/* ----------------------------------------------------------------- claude */

function buildPrompt(issue) {
  return [
    `You are fixing GitHub issue #${issue.number} in this repository.`,
    '',
    `Title: ${issue.title}`,
    '',
    'Body:',
    issue.body || '(no description)',
    '',
    'Instructions:',
    '- Investigate and implement a focused change for this issue only. It may be a bug',
    '  report or a feature request — both are in scope, so do not refuse one for not',
    '  being a bug.',
    '- Run `npm test` and make sure it passes before finishing.',
    '- Do NOT commit or push — the surrounding script handles git.',
    '- If the issue is too vague to act on, make no changes and explain what is missing.',
  ].join('\n')
}

/** Run the local `claude` on the prompt inside the worktree. Resolves on exit. */
function runClaude(issue) {
  return new Promise((resolve) => {
    const args = ['-p']
    if (PERMISSION === 'skip') args.push('--dangerously-skip-permissions')
    else args.push('--permission-mode', 'acceptEdits')
    // shell:true resolves the claude.cmd shim on Windows; args are all static and
    // the (untrusted) issue text goes in over stdin, so nothing is shell-injected.
    const child = spawn('claude', args, { cwd: WORKTREE, stdio: ['pipe', 'inherit', 'inherit'], shell: true })
    child.on('error', (err) => resolve({ ok: false, detail: String(err) }))
    child.on('exit', (code) => resolve({ ok: code === 0, detail: `claude exited ${code}` }))
    child.stdin.write(buildPrompt(issue))
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
    const res = await runClaude(issue)
    if (!res.ok) throw new Error(res.detail)
    if (!hasChanges()) {
      await comment(n, `Auto-fix ran but made no changes (${res.detail}). Leaving open for a human.`)
      await removeLabel(n, RUNNING_LABEL)
      await addLabels(n, [FAILED_LABEL])
      return
    }
    worktreeGit(['add', '-A'])
    const msg = `Auto-fix issue #${n}: ${issue.title}\n\nFixes #${n}`
    const commit = worktreeGit(['commit', '-m', msg])
    if (commit.status !== 0) throw new Error(`git commit failed: ${commit.stderr}`)
    const sha = (worktreeGit(['rev-parse', 'HEAD']).stdout || '').trim()
    // Push HEAD explicitly, not the branch NAME `main` — naming a local ref that
    // isn't the commit we just built is how a fix got reported as shipped while
    // `git push` sat there saying "Everything up-to-date".
    const push = worktreeGit(['push', 'origin', `${sha}:refs/heads/main`])
    if (push.status !== 0) throw new Error(`git push failed: ${push.stderr}`)
    // Trust the remote, not the exit code: confirm main really is our commit.
    const remoteHead = ((worktreeGit(['ls-remote', 'origin', 'refs/heads/main']).stdout || '')
      .trim()
      .split(/\s+/)[0] || '')
    if (remoteHead !== sha)
      throw new Error(`push reported success but origin/main is ${remoteHead || '(unknown)'}, not ${sha}`)
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
    if (seen.has(issue.number)) continue
    seen.add(issue.number)
    await processIssue(issue) // one at a time: they share one worktree + main
  }
}

console.log(`autofix: watching ${REPO} for "${LABEL}" issues every ${INTERVAL_MS / 1000}s.`)
await tick()
setInterval(() => void tick(), INTERVAL_MS)
