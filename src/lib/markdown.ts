/**
 * A small Markdown parser for coach replies.
 *
 * The model writes Markdown whether or not anything renders it — bullet lists,
 * **bold** numbers, `code` — and a chat bubble that prints the raw asterisks
 * makes its own advice harder to read. This turns that text into a tiny tree the
 * chat renders as real elements.
 *
 * It is deliberately a subset: paragraphs, headings, bullet and numbered lists
 * (nested), fenced code, block quotes, rules, and inline emphasis / code /
 * links. Anything it doesn't recognise stays literal text, which is the right
 * failure for a chat — no reply should come out mangled because a stray
 * asterisk confused the parser.
 */

export type MdInline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: MdInline[] }
  | { type: 'em'; children: MdInline[] }
  | { type: 'del'; children: MdInline[] }
  | { type: 'link'; href: string; children: MdInline[] }

export type MdBlock =
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'heading'; level: number; children: MdInline[] }
  | { type: 'list'; ordered: boolean; start: number; items: MdBlock[][] }
  | { type: 'code'; lang: string; value: string }
  | { type: 'quote'; children: MdBlock[] }
  | { type: 'rule' }

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*(\S*)/
const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const RULE = /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/
const QUOTE = /^ {0,3}>[ \t]?(.*)$/
const MARKER = /^([ \t]*)(?:([-*+])|(\d{1,9})[.)])[ \t]+(.*)$/

type Marker = { indent: number; ordered: boolean; number: number; text: string }

function markerAt(line: string): Marker | null {
  // A rule (`---`, `***`) also fits the bullet shape; it wins.
  if (RULE.test(line)) return null
  const m = MARKER.exec(line)
  if (!m) return null
  return {
    indent: indentOf(line),
    ordered: m[3] != null,
    number: m[3] != null ? Number(m[3]) : 1,
    text: m[4],
  }
}

function indentOf(line: string): number {
  return /^[ \t]*/.exec(line)![0].replace(/\t/g, '  ').length
}

/** Strip up to `n` leading spaces, so an item's own content parses from column 0. */
function dedent(line: string, n: number): string {
  const expanded = line.replace(/^[ \t]+/, (s) => s.replace(/\t/g, '  '))
  let i = 0
  while (i < n && expanded[i] === ' ') i++
  return expanded.slice(i)
}

/** True when the line opens a block that a running paragraph has to stop before. */
function startsBlock(line: string): boolean {
  return (
    !line.trim() ||
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    markerAt(line) != null
  )
}

/** Parse Markdown source into blocks. Never throws; unknown syntax stays text. */
export function parseMarkdown(src: string): MdBlock[] {
  return parseBlocks(src.replace(/\r\n?/g, '\n').split('\n'))
}

function parseBlocks(lines: string[]): MdBlock[] {
  const blocks: MdBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i++
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const marker = fence[1]
      const body: string[] = []
      i++
      // An unclosed fence runs to the end — which is what a half-streamed reply
      // looks like, so it reads as code the whole way instead of flickering.
      while (i < lines.length && !isFenceClose(lines[i], marker)) {
        body.push(lines[i])
        i++
      }
      if (i < lines.length) i++
      blocks.push({ type: 'code', lang: fence[2], value: body.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2]) })
      i++
      continue
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' })
      i++
      continue
    }

    if (QUOTE.test(line)) {
      const inner: string[] = []
      while (i < lines.length) {
        const q = QUOTE.exec(lines[i])
        if (!q) break
        inner.push(q[1])
        i++
      }
      blocks.push({ type: 'quote', children: parseBlocks(inner) })
      continue
    }

    const marker = markerAt(line)
    if (marker) {
      const list = parseList(lines, i, marker)
      blocks.push(list.block)
      i = list.next
      continue
    }

    const para: string[] = [line.trim()]
    i++
    while (i < lines.length && !startsBlock(lines[i])) {
      para.push(lines[i].trim())
      i++
    }
    blocks.push({ type: 'paragraph', children: parseInline(para.join('\n')) })
  }

  return blocks
}

function isFenceClose(line: string, marker: string): boolean {
  const trimmed = line.trim()
  return trimmed.length >= marker.length && [...trimmed].every((c) => c === marker[0])
}

/**
 * Collect one list, from its first marker line to the first line that isn't part
 * of it. Item content is dedented and parsed as blocks, so a nested list is just
 * this function again one level in.
 */
function parseList(lines: string[], start: number, first: Marker): { block: MdBlock; next: number } {
  const base = first.indent
  const items: string[][] = []
  let current: string[] | null = null
  let i = start

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      // A blank line only ends the list if what follows isn't part of it.
      let j = i + 1
      while (j < lines.length && !lines[j].trim()) j++
      if (j >= lines.length) break
      const after = markerAt(lines[j])
      const continues =
        indentOf(lines[j]) > base ||
        (after != null && after.ordered === first.ordered && after.indent <= base + 1)
      if (!continues) break
      current?.push('')
      i++
      continue
    }

    const marker = markerAt(line)
    if (marker && marker.indent <= base + 1) {
      // A bullet where numbers were (or the reverse) starts a different list.
      if (marker.ordered !== first.ordered) break
      current = [marker.text]
      items.push(current)
      i++
      continue
    }

    if (!current) break

    // Deeper markers and indented text belong to the item that's open.
    if (marker || indentOf(line) > base || !startsBlock(line)) {
      current.push(dedent(line, base + 2))
      i++
      continue
    }

    break
  }

  // Trailing blanks inside an item would otherwise become empty paragraphs.
  for (const item of items) {
    while (item.length && !item[item.length - 1].trim()) item.pop()
  }

  return {
    block: {
      type: 'list',
      ordered: first.ordered,
      start: first.ordered ? first.number : 1,
      items: items.map(parseBlocks),
    },
    next: i,
  }
}

const ESCAPABLE = '\\`*_~[]()#+-.!>'

/**
 * Emphasis forms, longest run first so `**x**` never parses as two `*x*`.
 *
 * Each opener demands a character after it that is neither space nor its own
 * delimiter, which is what stops an unclosed `**` from matching itself as empty
 * emphasis and swallowing the marker.
 */
const EMPHASIS: { re: RegExp; wrap: (children: MdInline[]) => MdInline }[] = [
  {
    re: /^\*\*\*(?=[^\s*])([\s\S]*?\S)\*\*\*/,
    wrap: (c) => ({ type: 'strong', children: [{ type: 'em', children: c }] }),
  },
  { re: /^\*\*(?=[^\s*])([\s\S]*?\S)\*\*/, wrap: (c) => ({ type: 'strong', children: c }) },
  { re: /^\*(?=[^\s*])([\s\S]*?\S)\*/, wrap: (c) => ({ type: 'em', children: c }) },
  {
    re: /^___(?=[^\s_])([\s\S]*?\S)___/,
    wrap: (c) => ({ type: 'strong', children: [{ type: 'em', children: c }] }),
  },
  { re: /^__(?=[^\s_])([\s\S]*?\S)__/, wrap: (c) => ({ type: 'strong', children: c }) },
  { re: /^_(?=[^\s_])([\s\S]*?\S)_/, wrap: (c) => ({ type: 'em', children: c }) },
  { re: /^~~(?=[^\s~])([\s\S]*?\S)~~/, wrap: (c) => ({ type: 'del', children: c }) },
]

const CODE_SPAN = /^(`+)([\s\S]*?[^`])\1(?!`)/
const LINK = /^\[([^\]]*)\]\(\s*<?([^\s<>)]*)>?(?:\s+"[^"]*")?\s*\)/
const AUTOLINK = /^https?:\/\/[^\s<>]+/i

/** Only schemes a chat link should ever open — no javascript:, no data:. */
function safeHref(href: string): string | null {
  const trimmed = href.trim()
  return /^(https?:\/\/|mailto:)/i.test(trimmed) ? trimmed : null
}

/** Parse the inline span of one block. Soft line breaks stay as `\n`. */
export function parseInline(src: string): MdInline[] {
  const out: MdInline[] = []
  let text = ''
  const flush = () => {
    if (text) out.push({ type: 'text', value: text })
    text = ''
  }

  let i = 0
  while (i < src.length) {
    const c = src[i]

    if (c === '\\' && i + 1 < src.length && ESCAPABLE.includes(src[i + 1])) {
      text += src[i + 1]
      i += 2
      continue
    }

    if (c === '`') {
      const code = CODE_SPAN.exec(src.slice(i))
      if (code) {
        flush()
        out.push({ type: 'code', value: code[2].trim() })
        i += code[0].length
        continue
      }
    }

    if (c === '[') {
      const link = LINK.exec(src.slice(i))
      const href = link && safeHref(link[2])
      if (link && href) {
        flush()
        out.push({ type: 'link', href, children: parseInline(link[1]) })
        i += link[0].length
        continue
      }
    }

    if (c === '*' || c === '_' || c === '~') {
      // `snake_case` and `a_b_c` are words, not emphasis.
      const intraword = c === '_' && /\w/.test(src[i - 1] ?? '')
      if (!intraword) {
        const rest = src.slice(i)
        let matched: { node: MdInline; length: number } | null = null
        for (const form of EMPHASIS) {
          const m = form.re.exec(rest)
          if (!m) continue
          if (c === '_' && /\w/.test(src[i + m[0].length] ?? '')) break
          matched = { node: form.wrap(parseInline(m[1])), length: m[0].length }
          break
        }
        if (matched) {
          flush()
          out.push(matched.node)
          i += matched.length
          continue
        }
      }
    }

    if ((c === 'h' || c === 'H') && AUTOLINK.test(src.slice(i))) {
      // Trailing punctuation reads as the sentence's, not the URL's.
      const url = AUTOLINK.exec(src.slice(i))![0].replace(/[.,;:!?)\]'"]+$/, '')
      if (url) {
        flush()
        out.push({ type: 'link', href: url, children: [{ type: 'text', value: url }] })
        i += url.length
        continue
      }
    }

    text += c
    i++
  }

  flush()
  return out
}

/** The plain text of a span tree — for previews and tests. */
export function inlineText(nodes: MdInline[]): string {
  return nodes
    .map((n) => (n.type === 'text' || n.type === 'code' ? n.value : inlineText(n.children)))
    .join('')
}
