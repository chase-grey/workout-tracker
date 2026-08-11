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
 *   - One watcher per checkout, held by a pid lockfile: two of them racing over
 *     the single worktree is worse than either alone (see claimWatcherLock).
 *   - `main` auto-deploys, but the deploy workflow runs `npm test` first, so a
 *     change that breaks tests fails the deploy instead of shipping.
 *   - A fix that loses a race with `main` gets rewritten against the new main
 *     rather than thrown away, and the commit that lost is kept under
 *     `refs/autofix/issue-<n>` so no run leaves good work in a branch it is
 *     about to reset (see processIssue and keepFix).
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
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
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
// How many times to write a fix for one issue. Only a lost race with `main` spends
// a second attempt (see processIssue), and each one is a full `claude` run, so this
// stays small: an issue that can't win twice wants a human, not a third try.
const FIX_ATTEMPTS = 2
const RUNNING_LABEL = 'autofix-running'
const FAILED_LABEL = 'autofix-failed'
// A failed issue is retried on a later tick rather than parked for good. Nearly
// every failure so far was the harness's fault rather than the issue's, and a
// permanent `autofix-failed` turned #13, #14, #22, #30, #31, #32, #34 and #35
// into a graveyard no tick would ever look at again — eight reports that each
// died on one bad run. The budget is counted from FAIL_MARKER comments already
// in the thread, so it survives a watcher restart and a genuinely hopeless issue
// still costs only this many runs before it stops and asks for a human.
const MAX_FAILURES = 3
// Invisible in the rendered issue, but countable here. Matching the human
// sentence instead would silently reset every budget the next time the wording
// changed.
const FAIL_MARKER = '<!-- autofix:failed -->'
// Parks an issue while the reporter answers. `auto-fix` comes off at the same
// time, so this poll leaves it alone until the app hands it back.
const ASK_LABEL = 'needs-input'
const WORKTREE = path.join(process.cwd(), '.autofix', 'worktree')
// The worktree gets its OWN branch: git refuses to check out `main` while your
// primary checkout has it, so borrowing the name left the worktree detached and
// turned the push into a no-op that still reported success.
const WORK_BRANCH = 'autofix-work'
const LOCK = path.join(process.cwd(), '.autofix', 'watcher.lock')
// Every `claude` run's output, kept per issue. Diagnosing the eight-issue stall
// meant guessing at what the runs had said, because the only copy of it was the
// scrollback of a terminal that had long since closed.
const LOGS = path.join(process.cwd(), '.autofix', 'logs')

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

/* ------------------------------------------------------------------- lock */

/** True if `pid` is a process we could signal — EPERM means alive but not ours. */
function pidAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err.code === 'EPERM'
  }
}

/**
 * Claim this checkout for exactly one watcher, or refuse to start.
 *
 * Two watchers don't merely duplicate work. Every run hard-resets the single
 * shared worktree (prepareWorktree), so the second one's reset orphans the
 * commit the first is mid-push on — which is how issue #6 got a "fixed in
 * e5baa1e0" comment naming a sha that four seconds later existed on no branch
 * at all. The `autofix-running` label can't prevent it: a watcher that read the
 * issue list before the label was added is already past that gate.
 *
 * The claim is a file created exclusively, holding our pid. A crash or a hard
 * kill leaves it behind, so a lock naming a pid that's gone is stale and gets
 * taken over. A recycled pid can read as live and keep a watcher out, which
 * costs a refusal you can see and clear — not a silent race.
 */
function claimWatcherLock() {
  mkdirSync(path.dirname(LOCK), { recursive: true })
  // Two passes at most: create, and if a stale lock was cleared, create again.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      writeFileSync(LOCK, `${process.pid}\n`, { flag: 'wx' })
      break
    } catch (err) {
      if (err.code !== 'EEXIST') throw err
      const holder = Number((readFileSync(LOCK, 'utf8') || '').trim())
      if (holder && holder !== process.pid && pidAlive(holder)) {
        console.error(
          `autofix: already watching this checkout as pid ${holder} — not starting a second one.\n` +
            `         Stop that process, or delete ${LOCK} if it's already gone.`,
        )
        process.exit(1)
      }
      rmSync(LOCK, { force: true })
      if (attempt === 2) throw new Error(`autofix: could not claim ${LOCK}`)
    }
  }
  process.on('exit', () => rmSync(LOCK, { force: true }))
  // A bare signal skips the exit handler, so route the ones we can catch
  // through process.exit and let it run the cleanup above.
  const signals = ['SIGINT', 'SIGTERM', ...(process.platform === 'win32' ? ['SIGBREAK'] : ['SIGHUP'])]
  for (const sig of signals) process.on(sig, () => process.exit(1))
}

/* --------------------------------------------------------------- worktree */

/**
 * Point the worktree's `node_modules` at the one the main checkout already has.
 *
 * A fresh worktree has no `node_modules` at all, so `npm test` there could only
 * ever fail — which is how the prompt came to order a test run that was not
 * physically possible. Installing a second copy per run would cost minutes and a
 * few hundred megabytes for a tree that is reset every time, so borrow the real
 * one: a junction on Windows, a directory symlink elsewhere, neither needing
 * elevation. `node_modules` is gitignored, so the `git clean -fd` below leaves it
 * alone (that clean has no `-x`, which is what makes this safe to do once).
 */
function linkNodeModules() {
  const link = path.join(WORKTREE, 'node_modules')
  const real = path.join(process.cwd(), 'node_modules')
  if (!existsSync(real)) return
  try {
    if (existsSync(link)) {
      // A link already in place is the state we want, and a genuine install that
      // somebody made by hand is theirs to keep. What has to go is the third case:
      // a bare directory holding nothing but the `.tmp` scratch folder vitest
      // leaves behind, which is what the worktree was found in and what made every
      // run's `npm test` impossible while still looking, to existsSync, like deps.
      if (lstatSync(link).isSymbolicLink()) return
      if (existsSync(path.join(link, '.bin'))) return
      rmSync(link, { recursive: true, force: true })
    }
    symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir')
  } catch (err) {
    // Not fatal on its own: say so plainly and let runTests report the miss,
    // rather than failing a fix that may be perfectly good.
    console.error(`autofix: could not link node_modules into the worktree — ${err}`)
  }
}

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
  linkNodeModules()
}

/**
 * Run the suite in the worktree, and return what to tell the issue if it failed.
 *
 * The harness runs the tests, not `claude`: inside an autofix run every way of
 * starting the suite (`npm test`, `npx vitest run`) is refused for want of anyone
 * to approve it, so asking claude to prove the tests pass produced runs that
 * either lied or, as here, gave up having changed nothing. Out here there is no
 * approver in the way. Returning the failing tail rather than throwing lets the
 * caller put it in the issue thread, where the next attempt's prompt will read it.
 */
function runTests() {
  const r = spawnSync('npm', ['test'], {
    cwd: WORKTREE,
    encoding: 'utf8',
    shell: true, // resolves npm.cmd on Windows; no untrusted text in the args
  })
  if (r.status === 0) return null
  const out = `${r.stdout || ''}\n${r.stderr || ''}`.trim()
  // The head carries the runner's own error (a missing binary, a config fault);
  // the tail carries the failing assertions. Both matter, and the whole run is
  // far too long to paste into a comment.
  return out.length > 3000 ? `${out.slice(0, 800)}\n\n...\n\n${out.slice(-2000)}` : out
}

function worktreeGit(args) {
  return spawnSync('git', args, { cwd: WORKTREE, encoding: 'utf8' })
}

/**
 * A fix that was written against a `main` that has since moved.
 *
 * Worth separating from every other failure because the fix itself isn't in
 * question — it just no longer applies, which a rewrite on the new base fixes and
 * a retry of the push never would. Carries the sha so the work can be kept.
 */
class StaleBaseError extends Error {
  constructor(detail, sha) {
    super(`the fix conflicts with newer work on main:\n${detail}`)
    this.name = 'StaleBaseError'
    this.sha = sha
  }
}

/**
 * Park `sha` under a ref of its own, and return the ref.
 *
 * `autofix-work` is the only thing pointing at a fix that failed to land, and the
 * next run's prepareWorktree resets that branch to origin/main — so the commit
 * becomes unreachable and gc eventually takes it. That's how issue #7's fix, five
 * files and a passing test suite, survived only until the next issue arrived.
 * A ref under refs/autofix/ is outside everything this script resets, so the work
 * waits there for a rebase by hand however long that takes.
 */
function keepFix(n, sha) {
  const ref = `refs/autofix/issue-${n}`
  return worktreeGit(['update-ref', ref, sha]).status === 0 ? ref : sha
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
      // The abort puts HEAD back on `sha`, so it's still there for the caller to
      // keep — but only until the next prepareWorktree.
      throw new StaleBaseError(detail, sha)
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
    '- Do NOT try to run the test suite: `npm test` and `npx vitest` are both refused',
    '  in this session, with nobody available to approve them. The surrounding script',
    '  runs the suite for you the moment you finish, and if it fails you get another',
    '  attempt with the failures quoted in the thread above. `npx tsc -b` does work,',
    '  so use that if you want a typecheck. Write or update tests as usual — just do',
    '  not try to execute them, and do not claim they pass.',
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
    const log = (text) => {
      try {
        mkdirSync(LOGS, { recursive: true })
        appendFileSync(path.join(LOGS, `issue-${issue.number}.log`), text)
      } catch {
        /* a log we can't write is not worth failing a fix over */
      }
    }
    log(`\n===== run started for #${issue.number}: ${issue.title}\n`)
    child.stdout.on('data', (chunk) => {
      out += chunk
      process.stdout.write(chunk)
      log(chunk)
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

/** How many times this issue has already failed, read from its own thread. */
const failuresSoFar = (comments) =>
  comments.filter((c) => (c.body || '').includes(FAIL_MARKER)).length

// The thread is the durable record, but listComments swallows its own errors and
// returns [] — which reads as "never failed before" and would retry forever while
// GitHub is unreachable. Counting here as well means the budget still holds when
// the thread can't be read; the thread's higher count wins across restarts.
const failuresThisRun = new Map()

/**
 * Record a failed run and decide whether the issue gets another go.
 *
 * Under budget the issue keeps `auto-fix` and loses `autofix-running`, so a later
 * tick picks it up again — with `why` now in the thread, which buildPrompt feeds
 * to the next attempt. At the budget it takes `autofix-failed` and stops, which is
 * the one case where that label is what it claims to be: a considered handover to
 * a human rather than the first stumble.
 */
async function recordFailure(n, why) {
  const priorComments = await listComments(n)
  failuresThisRun.set(n, (failuresThisRun.get(n) || 0) + 1)
  const failures = Math.max(failuresSoFar(priorComments) + 1, failuresThisRun.get(n))
  const done = failures >= MAX_FAILURES
  const note = done
    ? `Giving up after ${failures} attempts — over to a human.`
    : `Attempt ${failures} of ${MAX_FAILURES}. Will try again on the next pass.`
  await comment(n, `${FAIL_MARKER}\n**Auto-fix run failed.** ${note}\n\n\`\`\`\n${why.slice(0, 1500)}\n\`\`\``).catch(
    () => {},
  )
  await removeLabel(n, RUNNING_LABEL)
  if (done) {
    await addLabels(n, [FAILED_LABEL]).catch(() => {})
    console.log(`autofix: #${n} failed ${failures} times — parked for a human.`)
    return
  }
  // Forget it so a later tick can retry. `auto-fix` is deliberately left on.
  seen.delete(n)
  console.log(`autofix: #${n} failed (${failures}/${MAX_FAILURES}) — will retry.`)
}

async function processIssue(issue) {
  const n = issue.number
  console.log(`\nautofix: working #${n} — ${issue.title}`)
  await addLabels(n, [RUNNING_LABEL])
  try {
    // Writing a fix takes minutes and `main` moves the whole time — a push from
    // this machine, or the previous fix landing. pushToMain already rebases past
    // that, but a rebase can conflict, and when it does the fix is stale rather
    // than wrong: issue #7 died on two commits adding an import to the same line.
    // So start over on the main that now exists and let claude write against the
    // code that's really there, which beats resolving a conflict it can't see.
    for (let attempt = 1; ; attempt++) {
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
        await recordFailure(n, `Ran but changed nothing, and asked nothing (${res.detail}).`)
        return
      }
      // Tests before the commit, so a red suite never becomes a commit that has to
      // be reverted off main. A failure here is the issue's next prompt, not the
      // end of it: the tail goes in the thread and the retry reads it.
      const failing = runTests()
      if (failing) {
        await recordFailure(n, `The change did not pass \`npm test\`:\n\n${failing}`)
        return
      }
      worktreeGit(['add', '-A'])
      const msg = `Auto-fix issue #${n}: ${issue.title}\n\nFixes #${n}`
      const commit = worktreeGit(['commit', '-m', msg])
      if (commit.status !== 0) throw new Error(`git commit failed: ${commit.stderr}`)
      let sha
      try {
        sha = pushToMain()
      } catch (err) {
        if (!(err instanceof StaleBaseError)) throw err
        // Keep the commit before anything else: from here on the only branch
        // holding it is one prepareWorktree is about to reset.
        const kept = keepFix(n, err.sha)
        if (attempt >= FIX_ATTEMPTS) {
          throw new Error(`${err.message}\n\nThe fix is kept at ${kept} — rebase it onto main by hand.`)
        }
        console.log(`autofix: #${n} lost a race with main, rewriting on the new main (kept ${kept}).`)
        continue
      }
      await comment(n, `Fixed on \`main\` in ${sha.slice(0, 8)}. It will deploy once CI passes.`)
      await removeLabel(n, RUNNING_LABEL)
      await closeIssue(n)
      console.log(`autofix: #${n} fixed and pushed (${sha.slice(0, 8)}).`)
      return
    }
  } catch (err) {
    console.error(`autofix: #${n} failed — ${err}`)
    await recordFailure(n, String(err))
  }
}

/**
 * Reclaim issues left mid-run by a watcher that died.
 *
 * `autofix-running` is a claim with no expiry, and tick() skips it — so a watcher
 * killed while claude was working leaves the issue marked as in progress by a
 * process that no longer exists, and nothing ever looks at it again. We hold the
 * lock by the time this runs, which means no other watcher is alive to own such a
 * label, so every one of them is a corpse and safe to clear.
 */
async function reclaimRunningLabels() {
  let stuck
  try {
    stuck = await gh(
      'GET',
      `/repos/${REPO}/issues?state=open&labels=${encodeURIComponent(RUNNING_LABEL)}&per_page=100`,
    )
  } catch (err) {
    console.error(`autofix: could not check for interrupted runs — ${err}`)
    return
  }
  for (const issue of stuck) {
    if (issue.pull_request) continue
    await removeLabel(issue.number, RUNNING_LABEL)
    console.log(`autofix: #${issue.number} was left mid-run by a dead watcher — reclaimed.`)
  }
}

// A tick can outlast the interval many times over: one issue is minutes of
// `claude`, and the timer keeps firing throughout. Overlapping ticks pick up
// DIFFERENT issues, so `seen` never stops them, and they then share the single
// worktree — each one's prepareWorktree hard-resetting the others' edits, each
// one's `git add -A` sweeping whatever the others had written into a commit under
// its own issue number. That is what emptied the eight stalled issues: their work
// was reset or committed under a neighbour, so hasChanges() found nothing left to
// commit. One tick at a time, and the whole class of failure goes away.
let ticking = false

async function tick() {
  if (ticking) return
  ticking = true
  try {
    await pollOnce()
  } finally {
    ticking = false
  }
}

async function pollOnce() {
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

claimWatcherLock()
console.log(`autofix: watching ${REPO} for "${LABEL}" issues every ${INTERVAL_MS / 1000}s.`)
await reclaimRunningLabels()
await tick()
setInterval(() => void tick(), INTERVAL_MS)
