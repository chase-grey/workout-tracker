/**
 * Reading a question out of what the auto-fixer's `claude` printed.
 *
 * Split out of autofix.mjs so it can be tested: that file spawns processes and
 * starts polling GitHub the moment it's imported, and this is the one bit of it
 * that's pure. See scripts/autofix.mjs for how the question then travels.
 */

/** What claude has to lead with to ask for more rather than make a change. */
export const ASK_MARKER = 'NEEDS-INPUT'

const MARKER_KEY = ASK_MARKER.replace(/[^A-Za-z]/g, '').toUpperCase()

/**
 * The questions claude is asking, or '' if it isn't asking anything.
 *
 * The marker has to be the first non-empty line. Matching it anywhere in the
 * output would fire on a run that merely quoted its own instructions back while
 * describing the fix it just made. Punctuation and markdown emphasis around the
 * keyword are tolerated — a model reaches for `**NEEDS-INPUT:**` unprompted, and
 * losing a real question to a pair of asterisks strands the issue.
 */
export function parseAsk(output) {
  const body = String(output ?? '').trim()
  if (!body) return ''
  const nl = body.indexOf('\n')
  const first = nl === -1 ? body : body.slice(0, nl)
  if (first.replace(/[^A-Za-z]/g, '').toUpperCase() !== MARKER_KEY) return ''
  return nl === -1 ? '' : body.slice(nl + 1).trim()
}
